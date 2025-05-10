// Constants
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 18;
const INITIAL_DROP_TIME = 800;
const SPEED_INCREASE_FACTOR = 0.95;
const SCORE_UPDATE_DEBOUNCE_TIME = 100; // 100ms debounce for score updates
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
const HEARTBEAT_INTERVAL = 60 * 1000; // 1 minute in milliseconds
const RECONNECTION_GRACE_PERIOD = 30 * 1000; // 30 seconds grace period for reconnection
const SCORE_ANOMALY_THRESHOLD = 1000; // Threshold for detecting suspicious score increases
const MAX_SCORE_INCREASE_RATE = 500; // Maximum allowed score increase per second
const KICK_CHANNEL_ID = '53955207'; // Kick.com kanal ID'si

// Tetrominos
const TETROMINOS = {
  I: { shape: [[1, 1, 1, 1]], color: 'cyan-500' },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: 'blue-500' },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: 'orange-500' },
  O: { shape: [[1, 1], [1, 1]], color: 'yellow-500' },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: 'green-500' },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: 'purple-500' },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: 'red-500' },
};

// Game state
let board = [];
let currentPiece = null;
let score = 0;
let gameOver = false;
let dropTime = INITIAL_DROP_TIME;
let level = 1;
let isMusicPlaying = true;
let completedRows = [];
let dropInterval = null;
let currentUsername = '';
let currentKickName = '';
let uniqueUserId = '';
let leaderboardUnsubscribe = null;
let lastSavedScore = 0; // Track last saved score to avoid unnecessary updates
let highestScore = 0; // Track highest score for leaderboard
let scoreUpdateTimeout = null; // For debouncing score updates
let isScoreUpdatePending = false; // Flag to track if a score update is pending
let isBoardFull = false; // Flag to track if the board is full
let gameState = null; // For storing game state during connection loss
let lastScoreUpdateTime = Date.now(); // For tracking score update rate
let lastScoreValue = 0; // For tracking score changes

// Session state
let sessionStartTime = null;
let sessionId = null;
let gamesPlayed = 0;
let isNewUser = true;
let heartbeatInterval = null;
let lastActivityTime = Date.now();
let totalSessionDuration = 0;

// Connection state
let isOnline = navigator.onLine;
let reconnectionTimer = null;
let reconnectionCountdown = null;
let reconnectionTimeLeft = 30;
let reconnectionAttempts = 0;
let offlineMode = false;
let offlineGameState = null;
let localScores = []; // For storing scores locally when offline
let pendingScoreUpdates = []; // For storing score updates to be sent when back online

// Security state
let gameIntegrityChecks = {
  lastBoardState: null,
  lastScore: 0,
  scoreIncreaseHistory: [],
  suspiciousActivity: false,
  lastCheckTime: Date.now()
};

// DOM elements
const boardElement = document.getElementById('board');
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const gameOverElement = document.getElementById('gameOver');
const resetButton = document.getElementById('resetBtn');
const logoutButton = document.getElementById('logoutBtn');
const musicAudio = document.getElementById('tetrisMusic');
const usernameDisplay = document.getElementById('username');
const kickNameDisplay = document.getElementById('kickname');
const leaderboardList = document.getElementById('leaderboardList');
const notification = document.getElementById('notification');
const notificationTitle = document.getElementById('notificationTitle');
const notificationMessage = document.getElementById('notificationMessage');
const connectionStatus = document.getElementById('connectionStatus');
const connectionStatusText = document.getElementById('connectionStatusText');
const offlineModeElement = document.getElementById('offlineMode');
const reconnectionCountdownElement = document.getElementById('reconnectionCountdown');
const countdownTimerElement = document.getElementById('countdownTimer');

// Mobile touch controls
const rotateBtn = document.getElementById('rotateBtn');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const downBtn = document.getElementById('downBtn');

// Load local scores
function loadLocalScores() {
  try {
    const savedScores = localStorage.getItem('tetrisLocalScores');
    if (savedScores) {
      localScores = JSON.parse(savedScores);
    } else {
      localScores = [];
    }
    
    const pendingScores = localStorage.getItem('tetrisPendingScores');
    if (pendingScores) {
      pendingScoreUpdates = JSON.parse(pendingScores);
    } else {
      pendingScoreUpdates = [];
    }
  } catch (error) {
    console.error("Error loading local scores:", error);
    localScores = [];
    pendingScoreUpdates = [];
  }
}

// Generate a unique ID for the user
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Format date to readable string
function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  
  const date = timestamp instanceof Date ? timestamp : timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Show notification
function showNotification(type, title, message, duration = 5000) {
  notification.className = 'notification ' + type;
  notificationTitle.textContent = title;
  notificationMessage.textContent = message;
  notification.style.display = 'block';
  
  // Auto hide after duration
  setTimeout(hideNotification, duration);
}

// Hide notification
function hideNotification() {
  notification.style.display = 'none';
}

// Update connection status UI
function updateConnectionStatus(status, message) {
  connectionStatus.className = `connection-status ${status}`;
  connectionStatusText.textContent = message;
  connectionStatus.classList.add('visible');
  
  // Hide after 5 seconds if online
  if (status === 'online') {
    setTimeout(() => {
      connectionStatus.classList.remove('visible');
    }, 5000);
  }
}

// Check internet connection
function checkConnection() {
  return new Promise((resolve) => {
    // Try to fetch a small resource to check connection
    fetch('https://www.google.com/favicon.ico', { 
      mode: 'no-cors',
      cache: 'no-store'
    })
    .then(() => {
      resolve(true);
    })
    .catch(() => {
      resolve(false);
    });
  });
}

// Handle online event
async function handleOnline() {
  console.log('Browser reports online');
  
  // Double-check with an actual network request
  const isReallyOnline = await checkConnection();
  
  if (isReallyOnline) {
    isOnline = true;
    clearTimeout(reconnectionTimer);
    clearInterval(reconnectionCountdown);
    reconnectionAttempts = 0;
    
    updateConnectionStatus('online', 'Online');
    reconnectionCountdownElement.style.display = 'none';
    
    // If we were in offline mode, try to sync data
    if (offlineMode) {
      offlineMode = false;
      offlineModeElement.style.display = 'none';
      
      // Sync offline scores
      syncOfflineScores();
      
      showNotification('success', 'Connection Restored', 'You are back online. Your progress has been synced.');
    }
  } else {
    // False positive, still offline
    isOnline = false;
    handleOffline();
  }
}

// Handle offline event
function handleOffline() {
  console.log('Browser reports offline');
  isOnline = false;
  
  updateConnectionStatus('offline', 'Offline');
  
  // Start reconnection timer if not already running
  if (!reconnectionTimer) {
    reconnectionTimeLeft = 30;
    countdownTimerElement.textContent = reconnectionTimeLeft;
    reconnectionCountdownElement.style.display = 'block';
    
    // Start countdown
    reconnectionCountdown = setInterval(() => {
      reconnectionTimeLeft--;
      countdownTimerElement.textContent = reconnectionTimeLeft;
      
      if (reconnectionTimeLeft <= 0) {
        clearInterval(reconnectionCountdown);
        reconnectionCountdownElement.style.display = 'none';
        
        // If still offline after grace period, end the game
        if (!isOnline && !gameOver) {
          gameOver = true;
          gameOverElement.style.display = 'block';
          clearInterval(dropInterval);
          
          // Make sure final score is saved
          updateScoreNow(score);
          
          showNotification('error', 'Connection Lost', 'Game ended due to connection loss. Your score has been saved.');
        }
      }
    }, 1000);
    
    reconnectionTimer = setTimeout(() => {
      // If still offline after grace period, switch to offline mode
      if (!isOnline) {
        enterOfflineMode();
      }
      
      reconnectionTimer = null;
    }, RECONNECTION_GRACE_PERIOD);
    
    // Show reconnecting status
    updateConnectionStatus('reconnecting', 'Reconnecting...');
    
    // Try to reconnect periodically
    attemptReconnection();
  }
}

// Attempt to reconnect
function attemptReconnection() {
  reconnectionAttempts++;
  
  checkConnection().then(isConnected => {
    if (isConnected) {
      handleOnline();
    } else if (reconnectionAttempts < 5 && reconnectionTimeLeft > 0) {
      // Try again in a few seconds
      setTimeout(attemptReconnection, 5000);
    }
  });
}

// Enter offline mode
function enterOfflineMode() {
  offlineMode = true;
  offlineModeElement.style.display = 'block';
  
  // Save current game state
  saveGameState();
  
  // Load local scores
  loadLocalScores();
  
  showNotification('warning', 'Offline Mode', 'You are playing in offline mode. Your progress will be saved locally and synced when you reconnect.');
}

// Save game state
function saveGameState() {
  gameState = {
    board: JSON.parse(JSON.stringify(board)),
    currentPiece: currentPiece ? JSON.parse(JSON.stringify(currentPiece)) : null,
    score: score,
    level: level,
    dropTime: dropTime
  };
  
  // Save to localStorage
  try {
    localStorage.setItem('tetrisGameState', JSON.stringify(gameState));
  } catch (error) {
    console.error("Error saving game state to localStorage:", error);
  }
}

// Load game state
function loadGameState() {
  try {
    const savedState = localStorage.getItem('tetrisGameState');
    if (savedState) {
      gameState = JSON.parse(savedState);
      return true;
    }
  } catch (error) {
    console.error("Error loading game state from localStorage:", error);
  }
  return false;
}

// Save score locally
function saveScoreLocally(username, kickName, score) {
  try {
    // Load existing scores
    loadLocalScores();
    
    // Add new score
    const newScore = {
      username: username,
      kickName: kickName,
      score: score,
      timestamp: Date.now()
    };
    
    // Check if user already has a score
    const existingIndex = localScores.findIndex(s => s.username === username);
    if (existingIndex >= 0) {
      // Update if new score is higher
      if (score > localScores[existingIndex].score) {
        localScores[existingIndex] = newScore;
      }
    } else {
      // Add new score
      localScores.push(newScore);
    }
    
    // Sort scores
    localScores.sort((a, b) => b.score - a.score);
    
    // Save back to localStorage
    localStorage.setItem('tetrisLocalScores', JSON.stringify(localScores));
    
    // Add to pending updates
    pendingScoreUpdates.push(newScore);
    localStorage.setItem('tetrisPendingScores', JSON.stringify(pendingScoreUpdates));
  } catch (error) {
    console.error("Error saving score locally:", error);
  }
}

// Sync offline scores with server
function syncOfflineScores() {
  if (pendingScoreUpdates.length === 0) return;
  
  console.log("Syncing offline scores:", pendingScoreUpdates);
  
  // Process each pending update
  const updates = [...pendingScoreUpdates];
  pendingScoreUpdates = [];
  
  updates.forEach(update => {
    firebaseClient.updateUserScore(update.username, update.kickName, update.score)
      .then(() => {
        console.log("Offline score synced successfully");
      })
      .catch(error => {
        console.error("Error syncing offline score:", error);
        pendingScoreUpdates.push(update);
      });
  });
  
  // Save any remaining pending updates
  localStorage.setItem('tetrisPendingScores', JSON.stringify(pendingScoreUpdates));
}

// Update local leaderboard
function updateLocalLeaderboard() {
  leaderboardList.innerHTML = '';
  
  if (localScores.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'leaderboard-item';
    emptyItem.innerHTML = `
      <span class="leaderboard-rank">-</span>
      <span class="leaderboard-username">No scores yet</span>
      <span class="leaderboard-score">-</span>
    `;
    leaderboardList.appendChild(emptyItem);
    return;
  }
  
  localScores.slice(0, 10).forEach((data, index) => {
    const rank = index + 1;
    const isCurrentUser = data.username === currentUsername;
    
    const item = document.createElement('li');
    item.className = `leaderboard-item rank-${rank}`;
    
    if (isCurrentUser) {
      item.classList.add('current-user');
    }
    
    item.innerHTML = `
      <span class="leaderboard-rank">${rank}</span>
      <span class="leaderboard-username">${data.username}</span>
      <span class="leaderboard-score">${data.score}</span>
    `;
    
    leaderboardList.appendChild(item);
  });
}

// Debounce function for score updates
function debounce(func, wait) {
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(scoreUpdateTimeout);
    isScoreUpdatePending = true;
    
    scoreUpdateTimeout = setTimeout(function() {
      func.apply(context, args);
      isScoreUpdatePending = false;
    }, wait);
  };
}

// Start session tracking
function startSession() {
  sessionStartTime = Date.now();
  sessionId = generateUniqueId();
  gamesPlayed = 0;
  
  // Record session start
  firebaseClient.startSession(currentUsername, currentKickName, sessionId)
    .then(() => {
      console.log("Session started");
    })
    .catch(error => {
      console.error("Error starting session:", error);
    });
  
  // Set up heartbeat
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  
  // Set up activity tracking
  document.addEventListener('click', updateActivity);
  document.addEventListener('keydown', updateActivity);
}

// Update activity timestamp
function updateActivity() {
  lastActivityTime = Date.now();
}

// Send heartbeat
function sendHeartbeat() {
  if (!sessionId) return;
  
  const now = Date.now();
  const inactiveTime = now - lastActivityTime;
  
  // If inactive for more than 5 minutes, end session
  if (inactiveTime > 5 * 60 * 1000) {
    endSession();
    return;
  }
  
  // Update session duration
  const sessionDuration = now - sessionStartTime;
  totalSessionDuration = sessionDuration;
  
  firebaseClient.sendHeartbeat(sessionId, sessionDuration, gamesPlayed, Math.max(highestScore, score))
    .catch(error => {
      console.error("Error updating session heartbeat:", error);
    });
}

// End session
function endSession() {
  if (!sessionId) return;
  
  // Clear heartbeat interval
  clearInterval(heartbeatInterval);
  
  // Remove activity listeners
  document.removeEventListener('click', updateActivity);
  document.removeEventListener('keydown', updateActivity);
  
  // Update session end time
  firebaseClient.endSession(sessionId, totalSessionDuration, gamesPlayed, Math.max(highestScore, score))
    .then(() => {
      console.log("Session ended");
    })
    .catch(error => {
      console.error("Error ending session:", error);
    });
}

// Subscribe to leaderboard updates
function subscribeToLeaderboard() {
  // Unsubscribe from previous listener if exists
  if (leaderboardUnsubscribe) {
    leaderboardUnsubscribe();
  }
  
  // Subscribe to real-time updates
  leaderboardUnsubscribe = firebaseClient.subscribeToLeaderboard((snapshot) => {
    updateLeaderboard(snapshot);
  });
}

// Update leaderboard with Firestore data
function updateLeaderboard(snapshot) {
  leaderboardList.innerHTML = '';
  
  if (snapshot.empty) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'leaderboard-item';
    emptyItem.innerHTML = `
      <span class="leaderboard-rank">-</span>
      <span class="leaderboard-username"></span>
      <span class="leaderboard-score">-</span>
    `;
    leaderboardList.appendChild(emptyItem);
    return;
  }
  
  snapshot.docs.forEach((doc, index) => {
    const data = doc.data();
    const rank = index + 1;
    const isCurrentUser = data.username === currentUsername;
    
    const item = document.createElement('li');
    item.className = `leaderboard-item rank-${rank}`;
    
    if (isCurrentUser) {
      item.classList.add('current-user');
    }
    
    item.innerHTML = `
      <span class="leaderboard-rank">${rank}</span>
      <span class="leaderboard-username">${data.username}</span>
      <span class="leaderboard-score">${data.score}</span>
    `;
    
    leaderboardList.appendChild(item);
  });
}

// Update score in Firestore (debounced)
const updateScore = debounce((newScore) => {
  updateScoreNow(newScore);
}, SCORE_UPDATE_DEBOUNCE_TIME);

// Update score immediately
function updateScoreNow(newScore) {
  if (newScore <= lastSavedScore) return;
  
  lastSavedScore = newScore;
  
  if (offlineMode) {
    // Save score locally
    saveScoreLocally(currentUsername, currentKickName, newScore);
    return;
  }
  
  if (!currentUsername || !currentKickName) return;
  
  firebaseClient.updateUserScore(currentUsername, currentKickName, newScore)
    .then(result => {
      if (result.updated) {
        console.log("Score updated successfully");
        highestScore = newScore;
      }
    })
    .catch(error => {
      console.error("Error updating score:", error);
    });
}

// Initialize the game board
function initBoard() {
  board = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    board[y] = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[y][x] = null;
    }
  }
}

// Render the game board
function renderBoard() {
  boardElement.innerHTML = '';
  boardElement.style.gridTemplateColumns = `repeat(${BOARD_WIDTH}, 1fr)`;
  
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      
      if (board[y][x]) {
        cell.classList.add(board[y][x]);
      }
      
      boardElement.appendChild(cell);
    }
  }
}

// Get a random tetromino
function getRandomTetromino() {
  const tetrominoTypes = Object.keys(TETROMINOS);
  const randomType = tetrominoTypes[Math.floor(Math.random() * tetrominoTypes.length)];
  const tetromino = TETROMINOS[randomType];
  
  return {
    shape: JSON.parse(JSON.stringify(tetromino.shape)),
    color: tetromino.color,
    x: Math.floor(BOARD_WIDTH / 2) - Math.floor(tetromino.shape[0].length / 2),
    y: 0
  };
}

// Check if the current piece can move to the specified position
function canMove(piece, offsetX, offsetY) {
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) {
        const newX = piece.x + x + offsetX;
        const newY = piece.y + y + offsetY;
        
        if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
          return false;
        }
        
        if (newY >= 0 && board[newY][newX]) {
          return false;
        }
      }
    }
  }
  
  return true;
}

// Move the current piece
function movePiece(offsetX, offsetY) {
  if (gameOver) return;
  
  if (canMove(currentPiece, offsetX, offsetY)) {
    currentPiece.x += offsetX;
    currentPiece.y += offsetY;
    renderPiece();
    return true;
  }
  
  return false;
}

// Rotate the current piece
function rotatePiece() {
  if (gameOver) return;
  
  const originalShape = JSON.parse(JSON.stringify(currentPiece.shape));
  const rotatedShape = [];
  
  // Transpose the matrix
  for (let x = 0; x < originalShape[0].length; x++) {
    rotatedShape[x] = [];
    for (let y = 0; y < originalShape.length; y++) {
      rotatedShape[x][y] = originalShape[originalShape.length - 1 - y][x];
    }
  }
  
  const originalPiece = JSON.parse(JSON.stringify(currentPiece));
  currentPiece.shape = rotatedShape;
  
  // Check if rotation is valid
  if (!canMove(currentPiece, 0, 0)) {
    // Try wall kicks
    const kicks = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 2, y: 0 },
      { x: -2, y: 0 }
    ];
    
    let validKickFound = false;
    
    for (const kick of kicks) {
      if (canMove(currentPiece, kick.x, kick.y)) {
        currentPiece.x += kick.x;
        currentPiece.y += kick.y;
        validKickFound = true;
        break;
      }
    }
    
    if (!validKickFound) {
      // Revert rotation
      currentPiece.shape = originalShape;
    }
  }
  
  renderPiece();
}

// Render the current piece on the board
function renderPiece() {
  // Clear previous piece position
  const cells = boardElement.querySelectorAll('.cell');
  for (let i = 0; i < cells.length; i++) {
    const x = i % BOARD_WIDTH;
    const y = Math.floor(i / BOARD_WIDTH);
    
    if (board[y][x] === null) {
      cells[i].className = 'cell';
    }
  }
  
  // Render current piece
  for (let y = 0; y < currentPiece.shape.length; y++) {
    for (let x = 0; x < currentPiece.shape[y].length; x++) {
      if (currentPiece.shape[y][x]) {
        const boardX = currentPiece.x + x;
        const boardY = currentPiece.y + y;
        
        if (boardY >= 0) {
          const index = boardY * BOARD_WIDTH + boardX;
          cells[index].classList.add(currentPiece.color);
        }
      }
    }
  }
}

// Lock the current piece in place
function lockPiece() {
  for (let y = 0; y < currentPiece.shape.length; y++) {
    for (let x = 0; x < currentPiece.shape[y].length; x++) {
      if (currentPiece.shape[y][x]) {
        const boardX = currentPiece.x + x;
        const boardY = currentPiece.y + y;
        
        if (boardY >= 0) {
          board[boardY][boardX] = currentPiece.color;
        } else {
          // Game over if piece is locked above the board
          gameOver = true;
          gameOverElement.style.display = 'block';
          clearInterval(dropInterval);
          
          // Make sure final score is saved
          updateScoreNow(score);
          
          // End session
          if (sessionId) {
            endSession();
          }
          
          return;
        }
      }
    }
  }
  
  // Check for completed rows
  checkRows();
  
  // Spawn new piece
  spawnPiece();
}

// Check for completed rows
function checkRows() {
  completedRows = [];
  
  for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
    let rowComplete = true;
    
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (board[y][x] === null) {
        rowComplete = false;
        break;
      }
    }
    
    if (rowComplete) {
      completedRows.push(y);
    }
  }
  
  if (completedRows.length > 0) {
    // Flash completed rows
    flashRows();
  }
}

// Flash completed rows
function flashRows() {
  const cells = boardElement.querySelectorAll('.cell');
  
  // Add flash animation to completed rows
  for (const row of completedRows) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const index = row * BOARD_WIDTH + x;
      cells[index].classList.add('flash');
    }
  }
  
  // Remove rows after animation
  setTimeout(() => {
    removeRows();
  }, 300);
}

// Remove completed rows
function removeRows() {
  // Sort rows in descending order to avoid issues when removing multiple rows
  completedRows.sort((a, b) => b - a);
  
  for (const row of completedRows) {
    // Remove the row
    board.splice(row, 1);
    
    // Add a new empty row at the top
    const newRow = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      newRow.push(null);
    }
    board.unshift(newRow);
  }
  
  // Update score
  updateScoreForRows(completedRows.length);
  
  // Re-render the board
  renderBoard();
  renderPiece();
}

// Update score for completed rows
function updateScoreForRows(numRows) {
  let rowScore = 0;
  
  switch (numRows) {
    case 1:
      rowScore = 100;
      break;
    case 2:
      rowScore = 300;
      break;
    case 3:
      rowScore = 500;
      break;
    case 4:
      rowScore = 800; // Tetris!
      break;
  }
  
  // Apply level multiplier
  rowScore *= level;
  
  // Update score
  score += rowScore;
  scoreElement.textContent = score;
  
  // Check for level up
  const newLevel = Math.floor(score / 1000) + 1;
  if (newLevel > level) {
    level = newLevel;
    levelElement.textContent = level;
    
    // Increase speed
    dropTime *= SPEED_INCREASE_FACTOR;
    
    // Update drop interval
    clearInterval(dropInterval);
    dropInterval = setInterval(dropPiece, dropTime);
    
    // Show level up notification
    showNotification('success', 'Level Up!', `You've reached level ${level}!`);
  }
  
  // Update score in Firebase (debounced)
  updateScore(score);
}

// Spawn a new piece
function spawnPiece() {
  currentPiece = getRandomTetromino();
  
  // Check if the board is full
  if (!canMove(currentPiece, 0, 0)) {
    gameOver = true;
    gameOverElement.style.display = 'block';
    clearInterval(dropInterval);
    
    // Make sure final score is saved
    updateScoreNow(score);
    
    // End session
    if (sessionId) {
      endSession();
    }
    
    return;
  }
  
  renderPiece();
}

// Drop the current piece
function dropPiece() {
  if (!movePiece(0, 1)) {
    lockPiece();
  }
}

// Hard drop the current piece
function hardDrop() {
  let distance = 0;
  while (movePiece(0, 1)) {
    distance++;
  }
  
  // Add score for hard drop
  score += distance;
  scoreElement.textContent = score;
  
  lockPiece();
  
  // Update score in Firebase (debounced)
  updateScore(score);
}

// Reset the game
function resetGame() {
  clearInterval(dropInterval);
  
  // Increment games played
  gamesPlayed++;
  
  // Initialize the game
  initBoard();
  renderBoard();
  
  score = 0;
  scoreElement.textContent = score;
  
  level = 1;
  levelElement.textContent = level;
  
  dropTime = INITIAL_DROP_TIME;
  
  gameOver = false;
  gameOverElement.style.display = 'none';
  
  spawnPiece();
  
  dropInterval = setInterval(dropPiece, dropTime);
}

// Initialize the game
function init() {
  initBoard();
  renderBoard();
  spawnPiece();
  
  dropInterval = setInterval(dropPiece, dropTime);
  
  // Reset security checks
  gameIntegrityChecks = {
    lastBoardState: JSON.stringify(board),
    lastScore: score,
    scoreIncreaseHistory: [],
    suspiciousActivity: false,
    lastCheckTime: Date.now()
  };
}

// Logout function
function logout() {
  // End session
  if (sessionId) {
    endSession();
  }
  
  // Clear user data
  localStorage.removeItem('tetrisCurrentUser');
  
  // Redirect to login page
  window.location.href = 'index.html';
}

// Event listeners
resetButton.addEventListener('click', resetGame);
logoutButton.addEventListener('click', logout);

// Keyboard controls
document.addEventListener('keydown', (e) => {
  if (gameOver) return;
  
  switch (e.key) {
    case 'ArrowLeft':
      movePiece(-1, 0);
      break;
    case 'ArrowRight':
      movePiece(1, 0);
      break;
    case 'ArrowDown':
      movePiece(0, 1);
      break;
    case 'ArrowUp':
      rotatePiece();
      break;
    case ' ':
      hardDrop();
      break;
  }
});

// Mobile touch controls
rotateBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  rotatePiece();
});

leftBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  movePiece(-1, 0);
});

rightBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  movePiece(1, 0);
});

downBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  hardDrop();
});

// Connection event listeners
window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);

// Before unload
window.addEventListener('beforeunload', () => {
  // End session
  if (sessionId) {
    endSession();
  }
  
  // Save game state
  if (!gameOver) {
    saveGameState();
  }
});

// Start background music at a lower volume
window.addEventListener('load', () => {
  musicAudio.volume = 0.1;
  musicAudio.play().catch(error => {
    console.error("Audio playback failed:", error);
    isMusicPlaying = false;
  });
  
  // Check if user is logged in
  const savedUser = localStorage.getItem('tetrisCurrentUser');
  if (!savedUser) {
    // Not logged in, redirect to login page
    window.location.href = 'index.html';
    return;
  }
  
  try {
    const user = JSON.parse(savedUser);
    if (!user || !user.verified) {
      // Not verified, redirect to login page
      window.location.href = 'index.html';
      return;
    }
    
    // Set user info
    currentUsername = user.username;
    currentKickName = user.kickName;
    uniqueUserId = user.id;
    
    // Display username and kick name
    usernameDisplay.textContent = currentUsername;
    kickNameDisplay.textContent = currentKickName;
    
    // Check initial connection status
    isOnline = navigator.onLine;
    if (isOnline) {
      // Initialize user in Firebase
      firebaseClient.initializeUser(currentUsername, currentKickName)
        .then(result => {
          if (result.exists) {
            highestScore = result.highestScore;
          }
          
          // Start session tracking
          startSession();
          
          // Subscribe to leaderboard
          subscribeToLeaderboard();
        })
        .catch(error => {
          console.error("Error initializing user:", error);
        });
    } else {
      handleOffline();
    }
    
    // Initialize the game
    init();
    
    // Show welcome notification
    showNotification('info', 'Hoş Geldiniz!', 'Tetris oyununa hoş geldiniz. İyi eğlenceler!');
  } catch (error) {
    console.error("Error parsing saved user:", error);
    localStorage.removeItem('tetrisCurrentUser');
    window.location.href = 'index.html';
  }
});