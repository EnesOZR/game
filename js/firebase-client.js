// Firebase Client - Tüm Firebase işlemleri için ortak kütüphane

// Firebase yapılandırması
const firebaseConfig = {
  apiKey: "AIzaSyCtvdWwhXnvbWSKshzZayNKo-U8aq6Fa8U",
  authDomain: "server-c7531.firebaseapp.com",
  projectId: "server-c7531",
  storageBucket: "server-c7531.firebasestorage.app",
  messagingSenderId: "37190898409",
  appId: "1:37190898409:web:b96e6e386d38c4d6775678"
};

// Firebase istemcisi
class FirebaseClient {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.initializeFirebase();
    this.currentSeason = null;
  }

  // Firebase'i başlat
  initializeFirebase() {
    try {
      if (!this.initialized) {
        firebase.initializeApp(firebaseConfig);
        this.db = firebase.firestore();
        this.initialized = true;
        console.log("Firebase başarıyla başlatıldı");
        
        // Aktif sezonu yükle
        this.loadCurrentSeason();
      }
    } catch (error) {
      console.error("Firebase başlatma hatası:", error);
    }
  }

  // Aktif sezonu yükle
  async loadCurrentSeason() {
    try {
      if (!this.db) return null;
      
      const snapshot = await this.db.collection('seasons')
        .where('active', '==', true)
        .limit(1)
        .get();
      
      if (!snapshot.empty) {
        this.currentSeason = {
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data()
        };
        console.log("Aktif sezon yüklendi:", this.currentSeason);
        return this.currentSeason;
      } else {
        console.log("Aktif sezon bulunamadı");
        return null;
      }
    } catch (error) {
      console.error("Sezon yükleme hatası:", error);
      return null;
    }
  }

  // Kullanıcı skorunu güncelle
  updateUserScore(username, kickName, score) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Firebase bağlantısı yok"));
        return;
      }

      // Kick adını belge kimliği olarak kullan
      const docId = kickName;

      this.db.collection('scores').doc(docId).get()
        .then((doc) => {
          if (doc.exists) {
            // Kullanıcı var, skoru daha yüksekse güncelle
            const existingScore = doc.data().score;

            if (score > existingScore) {
              return doc.ref.update({
                score: score,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
              });
            } else {
              resolve({ updated: false, message: "Mevcut skor daha yüksek" });
            }
          } else {
            // Kullanıcı yok, liderlik tablosuna ekle
            return this.db.collection('scores').doc(docId).set({
              username: username,
              kickName: kickName,
              score: score,
              timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        })
        .then(() => {
          // Sezon skorunu da güncelle (eğer aktif sezon varsa)
          if (this.currentSeason) {
            this.updateSeasonScore(kickName, username, score);
          }
          
          resolve({ updated: true, message: "Skor başarıyla güncellendi" });
        })
        .catch((error) => {
          console.error("Skor güncelleme hatası:", error);
          reject(error);
        });
    });
  }

  // Sezon skorunu güncelle
  updateSeasonScore(kickName, username, score) {
    if (!this.currentSeason || !this.db) return;

    const seasonId = this.currentSeason.id;
    const docId = kickName;

    this.db.collection('seasons').doc(seasonId)
      .collection('scores').doc(docId).get()
      .then((doc) => {
        if (doc.exists) {
          // Kullanıcı var, skoru daha yüksekse güncelle
          const existingScore = doc.data().score;

          if (score > existingScore) {
            return doc.ref.update({
              score: score,
              timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        } else {
          // Kullanıcı yok, sezon liderlik tablosuna ekle
          return this.db.collection('seasons').doc(seasonId)
            .collection('scores').doc(docId).set({
              username: username,
              kickName: kickName,
              score: score,
              timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
      })
      .catch((error) => {
        console.error("Sezon skoru güncelleme hatası:", error);
      });
  }

  // Liderlik tablosuna abone ol
  subscribeToLeaderboard(callback) {
    if (!this.db) {
      console.error("Firebase bağlantısı yok");
      return null;
    }

    // Önceki dinleyiciyi temizle
    if (this.leaderboardUnsubscribe) {
      this.leaderboardUnsubscribe();
    }

    // Gerçek zamanlı güncellemelere abone ol
    this.leaderboardUnsubscribe = this.db.collection('scores')
      .orderBy('score', 'desc')
      .limit(10)
      .onSnapshot((snapshot) => {
        callback(snapshot);
      }, (error) => {
        console.error("Liderlik tablosu abonelik hatası:", error);
      });

    return this.leaderboardUnsubscribe;
  }

  // Sezon liderlik tablosuna abone ol
  subscribeToSeasonLeaderboard(callback) {
    if (!this.db || !this.currentSeason) {
      console.error("Firebase bağlantısı yok veya aktif sezon yok");
      return null;
    }

    // Önceki dinleyiciyi temizle
    if (this.seasonLeaderboardUnsubscribe) {
      this.seasonLeaderboardUnsubscribe();
    }

    const seasonId = this.currentSeason.id;

    // Gerçek zamanlı güncellemelere abone ol
    this.seasonLeaderboardUnsubscribe = this.db.collection('seasons').doc(seasonId)
      .collection('scores')
      .orderBy('score', 'desc')
      .limit(10)
      .onSnapshot((snapshot) => {
        callback(snapshot);
      }, (error) => {
        console.error("Sezon liderlik tablosu abonelik hatası:", error);
      });

    return this.seasonLeaderboardUnsubscribe;
  }

  // Kullanıcıyı Firebase'de başlat
  initializeUser(username, kickName) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Firebase bağlantısı yok"));
        return;
      }

      // Kick adını belge kimliği olarak kullan
      const docId = kickName;

      this.db.collection('users').doc(docId).get()
        .then((doc) => {
          if (!doc.exists) {
            // Kullanıcı yok, yeni kullanıcı oluştur
            return this.db.collection('users').doc(docId).set({
              username: username,
              kickName: kickName,
              registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
              lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
              totalGamesPlayed: 0,
              highestScore: 0,
              banned: false,
              banReason: "",
              ipHistory: [],
              deviceHistory: []
            });
          } else {
            // Kullanıcı var, son giriş zamanını güncelle
            return doc.ref.update({
              lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        })
        .then(() => {
          // Kullanıcı skorunu kontrol et
          return this.db.collection('scores').doc(docId).get();
        })
        .then((doc) => {
          if (doc.exists) {
            // Kullanıcının skoru var
            resolve({ exists: true, highestScore: doc.data().score });
          } else {
            // Kullanıcının skoru yok, yeni skor oluştur
            return this.db.collection('scores').doc(docId).set({
              username: username,
              kickName: kickName,
              score: 0,
              timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        })
        .then(() => {
          if (arguments.length === 0) { // set işlemi yapıldıysa
            resolve({ exists: false, highestScore: 0 });
          }
        })
        .catch((error) => {
          console.error("Kullanıcı başlatma hatası:", error);
          reject(error);
        });
    });
  }

  // Kullanıcı IP ve cihaz bilgisini güncelle
  updateUserDeviceInfo(kickName, ipAddress, deviceInfo) {
    if (!this.db) return Promise.reject(new Error("Firebase bağlantısı yok"));

    const docId = kickName;
    
    return this.db.collection('users').doc(docId).get()
      .then((doc) => {
        if (doc.exists) {
          const userData = doc.data();
          let ipHistory = userData.ipHistory || [];
          let deviceHistory = userData.deviceHistory || [];
          
          // IP adresi zaten kayıtlı mı kontrol et
          const existingIpIndex = ipHistory.findIndex(ip => ip.address === ipAddress);
          if (existingIpIndex === -1) {
            // Yeni IP adresi ekle
            ipHistory.push({
              address: ipAddress,
              firstSeen: firebase.firestore.FieldValue.serverTimestamp(),
              lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
          } else {
            // Mevcut IP adresinin son görülme zamanını güncelle
            ipHistory[existingIpIndex].lastSeen = firebase.firestore.FieldValue.serverTimestamp();
          }
          
          // Cihaz bilgisi zaten kayıtlı mı kontrol et
          const deviceKey = `${deviceInfo.platform}-${deviceInfo.browser}`;
          const existingDeviceIndex = deviceHistory.findIndex(device => 
            device.platform === deviceInfo.platform && 
            device.browser === deviceInfo.browser
          );
          
          if (existingDeviceIndex === -1) {
            // Yeni cihaz bilgisi ekle
            deviceHistory.push({
              ...deviceInfo,
              firstSeen: firebase.firestore.FieldValue.serverTimestamp(),
              lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
          } else {
            // Mevcut cihaz bilgisinin son görülme zamanını güncelle
            deviceHistory[existingDeviceIndex].lastSeen = firebase.firestore.FieldValue.serverTimestamp();
          }
          
          // Kullanıcı belgesini güncelle
          return doc.ref.update({
            ipHistory: ipHistory,
            deviceHistory: deviceHistory
          });
        }
      });
  }

  // Oturum başlat
  startSession(username, kickName, sessionId, ipAddress, deviceInfo) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Firebase bağlantısı yok"));
        return;
      }

      // Kullanıcı IP ve cihaz bilgisini güncelle
      this.updateUserDeviceInfo(kickName, ipAddress, deviceInfo)
        .catch(error => console.error("Kullanıcı cihaz bilgisi güncelleme hatası:", error));

      // Kick adını belge kimliği olarak kullan
      const docId = kickName;
      
      // Yeni oturum belgesini oluştur
      this.db.collection('users').doc(docId)
        .collection('sessions').doc(sessionId).set({
          username: username,
          kickName: kickName,
          sessionId: sessionId,
          startTime: firebase.firestore.FieldValue.serverTimestamp(),
          endTime: null,
          duration: 0,
          gamesPlayed: 0,
          highestScore: 0,
          ipAddress: ipAddress,
          device: deviceInfo,
          active: true
        })
        .then(() => {
          // Aktif kullanıcı sayısını güncelle
          return this.incrementActiveUsers(1);
        })
        .then(() => {
          // Günlük istatistikleri güncelle
          return this.updateDailyStats('logins', 1);
        })
        .then(() => {
          resolve({ success: true });
        })
        .catch((error) => {
          console.error("Oturum başlatma hatası:", error);
          reject(error);
        });
    });
  }

  // Aktif kullanıcı sayısını artır/azalt
  incrementActiveUsers(increment) {
    if (!this.db) return Promise.reject(new Error("Firebase bağlantısı yok"));

    const statsRef = this.db.collection('stats').doc('realtime');
    
    return this.db.runTransaction(transaction => {
      return transaction.get(statsRef).then(doc => {
        if (!doc.exists) {
          transaction.set(statsRef, { activeUsers: increment > 0 ? 1 : 0 });
        } else {
          const newCount = (doc.data().activeUsers || 0) + increment;
          transaction.update(statsRef, { activeUsers: Math.max(0, newCount) });
        }
      });
    });
  }

  // Günlük istatistikleri güncelle
  updateDailyStats(statName, increment) {
    if (!this.db) return Promise.reject(new Error("Firebase bağlantısı yok"));

    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD formatı
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    
    const statsRef = this.db.collection('stats').doc('daily');
    
    return this.db.runTransaction(transaction => {
      return transaction.get(statsRef).then(doc => {
        let data = doc.exists ? doc.data() : {};
        
        // Yıl-ay-gün hiyerarşisi oluştur
        if (!data[year]) data[year] = {};
        if (!data[year][month]) data[year][month] = {};
        if (!data[year][month][day]) data[year][month][day] = {};
        if (!data[year][month][day][statName]) data[year][month][day][statName] = 0;
        
        // İstatistiği artır
        data[year][month][day][statName] += increment;
        
        // Toplam değeri de güncelle
        if (!data.totals) data.totals = {};
        if (!data.totals[statName]) data.totals[statName] = 0;
        data.totals[statName] += increment;
        
        transaction.set(statsRef, data);
      });
    });
  }

  // Oturum kalp atışı gönder
  sendHeartbeat(kickName, sessionId, duration, gamesPlayed, highestScore) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Firebase bağlantısı yok"));
        return;
      }

      // Kick adını belge kimliği olarak kullan
      const docId = kickName;
      
      this.db.collection('users').doc(docId)
        .collection('sessions').doc(sessionId).update({
          lastHeartbeat: firebase.firestore.FieldValue.serverTimestamp(),
          duration: duration,
          gamesPlayed: gamesPlayed,
          highestScore: highestScore
        })
        .then(() => {
          resolve({ success: true });
        })
        .catch((error) => {
          console.error("Kalp atışı güncelleme hatası:", error);
          reject(error);
        });
    });
  }

  // Oturumu sonlandır
  endSession(kickName, sessionId, duration, gamesPlayed, highestScore) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Firebase bağlantısı yok"));
        return;
      }

      // Kick adını belge kimliği olarak kullan
      const docId = kickName;
      
      this.db.collection('users').doc(docId)
        .collection('sessions').doc(sessionId).update({
          endTime: firebase.firestore.FieldValue.serverTimestamp(),
          duration: duration,
          gamesPlayed: gamesPlayed,
          highestScore: highestScore,
          active: false
        })
        .then(() => {
          // Kullanıcının toplam oyun sayısını güncelle
          return this.db.collection('users').doc(docId).get();
        })
        .then((doc) => {
          if (doc.exists) {
            const userData = doc.data();
            const totalGamesPlayed = (userData.totalGamesPlayed || 0) + gamesPlayed;
            const userHighestScore = Math.max(userData.highestScore || 0, highestScore);
            
            return doc.ref.update({
              totalGamesPlayed: totalGamesPlayed,
              highestScore: userHighestScore
            });
          }
        })
        .then(() => {
          // Aktif kullanıcı sayısını azalt
          return this.incrementActiveUsers(-1);
        })
        .then(() => {
          resolve({ success: true });
        })
        .catch((error) => {
          console.error("Oturum sonlandırma hatası:", error);
          reject(error);
        });
    });
  }

  // Kick.com API'sinden mesajları al
  fetchKickMessages(channelId) {
    return fetch(`https://kick.com/api/v2/channels/${channelId}/messages`)
      .then(response => {
        if (!response.ok) {
          throw new Error('API isteği başarısız');
        }
        return response.json();
      });
  }

  // Kullanıcı IP adresini al
  async getUserIpAddress() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error("IP adresi alma hatası:", error);
      return "unknown";
    }
  }

  // Kullanıcı cihaz bilgisini al
  getUserDeviceInfo() {
    const ua = navigator.userAgent;
    let browserName = "Unknown";
    let browserVersion = "";
    let osName = "Unknown";
    let osVersion = "";
    let deviceType = "Unknown";

    // İşletim sistemi tespiti
    if (ua.indexOf("Windows") !== -1) {
      osName = "Windows";
      if (ua.indexOf("Windows NT 10.0") !== -1) osVersion = "10";
      else if (ua.indexOf("Windows NT 6.3") !== -1) osVersion = "8.1";
      else if (ua.indexOf("Windows NT 6.2") !== -1) osVersion = "8";
      else if (ua.indexOf("Windows NT 6.1") !== -1) osVersion = "7";
    } else if (ua.indexOf("Mac") !== -1) {
      osName = "MacOS";
      const macOSVersion = ua.match(/Mac OS X ([0-9_]+)/);
      if (macOSVersion) osVersion = macOSVersion[1].replace(/_/g, '.');
    } else if (ua.indexOf("Android") !== -1) {
      osName = "Android";
      const androidVersion = ua.match(/Android ([0-9\.]+)/);
      if (androidVersion) osVersion = androidVersion[1];
    } else if (ua.indexOf("iOS") !== -1 || ua.indexOf("iPhone") !== -1 || ua.indexOf("iPad") !== -1) {
      osName = "iOS";
      const iosVersion = ua.match(/OS ([0-9_]+)/);
      if (iosVersion) osVersion = iosVersion[1].replace(/_/g, '.');
    } else if (ua.indexOf("Linux") !== -1) {
      osName = "Linux";
    }

    // Tarayıcı tespiti
    if (ua.indexOf("Chrome") !== -1 && ua.indexOf("Edg") === -1 && ua.indexOf("OPR") === -1) {
      browserName = "Chrome";
      const chromeVersion = ua.match(/Chrome\/([0-9\.]+)/);
      if (chromeVersion) browserVersion = chromeVersion[1];
    } else if (ua.indexOf("Firefox") !== -1) {
      browserName = "Firefox";
      const firefoxVersion = ua.match(/Firefox\/([0-9\.]+)/);
      if (firefoxVersion) browserVersion = firefoxVersion[1];
    } else if (ua.indexOf("Safari") !== -1 && ua.indexOf("Chrome") === -1) {
      browserName = "Safari";
      const safariVersion = ua.match(/Safari\/([0-9\.]+)/);
      if (safariVersion) browserVersion = safariVersion[1];
    } else if (ua.indexOf("Edg") !== -1) {
      browserName = "Edge";
      const edgeVersion = ua.match(/Edg\/([0-9\.]+)/);
      if (edgeVersion) browserVersion = edgeVersion[1];
    } else if (ua.indexOf("OPR") !== -1) {
      browserName = "Opera";
      const operaVersion = ua.match(/OPR\/([0-9\.]+)/);
      if (operaVersion) browserVersion = operaVersion[1];
    }

    // Cihaz tipi tespiti
    if (ua.indexOf("Mobile") !== -1 || ua.indexOf("Android") !== -1 && ua.indexOf("Mobi") !== -1) {
      deviceType = "Mobile";
    } else if (ua.indexOf("iPad") !== -1 || ua.indexOf("Tablet") !== -1) {
      deviceType = "Tablet";
    } else {
      deviceType = "Desktop";
    }

    return {
      browser: browserName,
      browserVersion: browserVersion,
      os: osName,
      osVersion: osVersion,
      deviceType: deviceType,
      userAgent: ua,
      language: navigator.language,
      platform: navigator.platform,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height
    };
  }

  // Admin: Kullanıcıları getir
  async getUsers(limit = 20, startAfter = null, filters = {}) {
    if (!this.db) return { users: [], lastDoc: null };

    try {
      let query = this.db.collection('users');
      
      // Filtreleri uygula
      if (filters.banned === true) {
        query = query.where('banned', '==', true);
      } else if (filters.banned === false) {
        query = query.where('banned', '==', false);
      }
      
      // Sıralama
      if (filters.orderBy) {
        query = query.orderBy(filters.orderBy, filters.orderDir || 'desc');
      } else {
        query = query.orderBy('lastLogin', 'desc');
      }
      
      // Sayfalama
      if (startAfter) {
        query = query.startAfter(startAfter);
      }
      
      query = query.limit(limit);
      
      const snapshot = await query.get();
      
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
      
      return { users, lastDoc };
    } catch (error) {
      console.error("Kullanıcıları getirme hatası:", error);
      return { users: [], lastDoc: null };
    }
  }

  // Admin: Kullanıcı ara
  async searchUsers(searchTerm) {
    if (!this.db) return [];

    try {
      // Kick adı veya kullanıcı adı ile ara
      const kickNameSnapshot = await this.db.collection('users')
        .where('kickName', '>=', searchTerm)
        .where('kickName', '<=', searchTerm + '\uf8ff')
        .limit(10)
        .get();
      
      const usernameSnapshot = await this.db.collection('users')
        .where('username', '>=', searchTerm)
        .where('username', '<=', searchTerm + '\uf8ff')
        .limit(10)
        .get();
      
      // Sonuçları birleştir ve tekrarları kaldır
      const results = new Map();
      
      kickNameSnapshot.docs.forEach(doc => {
        results.set(doc.id, { id: doc.id, ...doc.data() });
      });
      
      usernameSnapshot.docs.forEach(doc => {
        results.set(doc.id, { id: doc.id, ...doc.data() });
      });
      
      return Array.from(results.values());
    } catch (error) {
      console.error("Kullanıcı arama hatası:", error);
      return [];
    }
  }

  // Admin: Kullanıcıyı banla
  async banUser(kickName, reason) {
    if (!this.db) return { success: false, error: "Firebase bağlantısı yok" };

    try {
      await this.db.collection('users').doc(kickName).update({
        banned: true,
        banReason: reason,
        banDate: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      console.error("Kullanıcı banlama hatası:", error);
      return { success: false, error: error.message };
    }
  }

  // Admin: Kullanıcı banını kaldır
  async unbanUser(kickName) {
    if (!this.db) return { success: false, error: "Firebase bağlantısı yok" };

    try {
      await this.db.collection('users').doc(kickName).update({
        banned: false,
        banReason: "",
        unbanDate: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      console.error("Kullanıcı ban kaldırma hatası:", error);
      return { success: false, error: error.message };
    }
  }

  // Admin: Kullanıcı skorunu sıfırla
  async resetUserScore(kickName) {
    if (!this.db) return { success: false, error: "Firebase bağlantısı yok" };

    try {
      // Genel skor tablosunu güncelle
      await this.db.collection('scores').doc(kickName).update({
        score: 0,
        resetDate: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Kullanıcı belgesini güncelle
      await this.db.collection('users').doc(kickName).update({
        highestScore: 0
      });
      
      // Aktif sezon varsa, sezon skorunu da sıfırla
      if (this.currentSeason) {
        const seasonId = this.currentSeason.id;
        const seasonScoreRef = this.db.collection('seasons').doc(seasonId)
          .collection('scores').doc(kickName);
        
        const doc = await seasonScoreRef.get();
        if (doc.exists) {
          await seasonScoreRef.update({
            score: 0,
            resetDate: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error("Kullanıcı skoru sıfırlama hatası:", error);
      return { success: false, error: error.message };
    }
  }

  // Admin: İstatistikleri getir
  async getStats(period = 'daily') {
    if (!this.db) return null;

    try {
      // Gerçek zamanlı istatistikleri al
      const realtimeStatsDoc = await this.db.collection('stats').doc('realtime').get();
      const realtimeStats = realtimeStatsDoc.exists ? realtimeStatsDoc.data() : { activeUsers: 0 };
      
      // Günlük istatistikleri al
      const dailyStatsDoc = await this.db.collection('stats').doc('daily').get();
      const dailyStats = dailyStatsDoc.exists ? dailyStatsDoc.data() : {};
      
      // Dönem bazlı istatistikleri hazırla
      let periodStats = {};
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const day = today.getDate();
      
      if (period === 'daily') {
        // Bugünün istatistikleri
        periodStats = dailyStats[year]?.[month]?.[day] || {};
      } else if (period === 'weekly') {
        // Son 7 günün istatistikleri
        periodStats = this.aggregateStats(dailyStats, 7);
      } else if (period === 'monthly') {
        // Bu ayın istatistikleri
        periodStats = this.aggregateMonthStats(dailyStats, year, month);
      }
      
      return {
        realtime: realtimeStats,
        period: periodStats,
        totals: dailyStats.totals || {}
      };
    } catch (error) {
      console.error("İstatistikleri getirme hatası:", error);
      return null;
    }
  }

  // İstatistikleri belirli gün sayısı için topla
  aggregateStats(dailyStats, days) {
    const result = { logins: 0, gamesPlayed: 0 };
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      
      const dayStats = dailyStats[year]?.[month]?.[day] || {};
      
      // İstatistikleri topla
      for (const key in dayStats) {
        if (!result[key]) result[key] = 0;
        result[key] += dayStats[key];
      }
    }
    
    return result;
  }

  // Ay bazlı istatistikleri topla
  aggregateMonthStats(dailyStats, year, month) {
    const result = { logins: 0, gamesPlayed: 0 };
    
    // Ayın gün sayısını bul
    const daysInMonth = new Date(year, month, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStats = dailyStats[year]?.[month]?.[day] || {};
      
      // İstatistikleri topla
      for (const key in dayStats) {
        if (!result[key]) result[key] = 0;
        result[key] += dayStats[key];
      }
    }
    
    return result;
  }

  // Admin: Sezon oluştur
  async createSeason(seasonData) {
    if (!this.db) return { success: false, error: "Firebase bağlantısı yok" };

    try {
      // Eğer yeni sezon aktif olacaksa, diğer aktif sezonları devre dışı bırak
      if (seasonData.active) {
        const activeSeasons = await this.db.collection('seasons')
          .where('active', '==', true)
          .get();
        
        const batch = this.db.batch();
        activeSeasons.docs.forEach(doc => {
          batch.update(doc.ref, { active: false });
        });
        
        await batch.commit();
      }
      
      // Yeni sezonu oluştur
      const seasonRef = await this.db.collection('seasons').add({
        name: seasonData.name,
        startDate: firebase.firestore.Timestamp.fromDate(new Date(seasonData.startDate)),
        endDate: firebase.firestore.Timestamp.fromDate(new Date(seasonData.endDate)),
        active: seasonData.active,
        rewards: seasonData.rewards || [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Aktif sezonu yeniden yükle
      if (seasonData.active) {
        await this.loadCurrentSeason();
      }
      
      return { success: true, seasonId: seasonRef.id };
    } catch (error) {
      console.error("Sezon oluşturma hatası:", error);
      return { success: false, error: error.message };
    }
  }

  // Admin: Sezonları getir
  async getSeasons() {
    if (!this.db) return [];

    try {
      const snapshot = await this.db.collection('seasons')
        .orderBy('startDate', 'desc')
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Sezonları getirme hatası:", error);
      return [];
    }
  }

  // Admin: Sezon detaylarını getir
  async getSeasonDetails(seasonId) {
    if (!this.db) return null;

    try {
      const seasonDoc = await this.db.collection('seasons').doc(seasonId).get();
      
      if (!seasonDoc.exists) {
        return null;
      }
      
      // Sezon skorlarını al
      const scoresSnapshot = await this.db.collection('seasons').doc(seasonId)
        .collection('scores')
        .orderBy('score', 'desc')
        .limit(10)
        .get();
      
      const scores = scoresSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      return {
        id: seasonDoc.id,
        ...seasonDoc.data(),
        topScores: scores
      };
    } catch (error) {
      console.error("Sezon detayları getirme hatası:", error);
      return null;
    }
  }

  // Admin: Sezon güncelle
  async updateSeason(seasonId, seasonData) {
    if (!this.db) return { success: false, error: "Firebase bağlantısı yok" };

    try {
      // Eğer sezon aktif olacaksa, diğer aktif sezonları devre dışı bırak
      if (seasonData.active) {
        const activeSeasons = await this.db.collection('seasons')
          .where('active', '==', true)
          .where(firebase.firestore.FieldPath.documentId(), '!=', seasonId)
          .get();
        
        const batch = this.db.batch();
        activeSeasons.docs.forEach(doc => {
          batch.update(doc.ref, { active: false });
        });
        
        await batch.commit();
      }
      
      // Sezonu güncelle
      await this.db.collection('seasons').doc(seasonId).update({
        name: seasonData.name,
        startDate: firebase.firestore.Timestamp.fromDate(new Date(seasonData.startDate)),
        endDate: firebase.firestore.Timestamp.fromDate(new Date(seasonData.endDate)),
        active: seasonData.active,
        rewards: seasonData.rewards || [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Aktif sezonu yeniden yükle
      await this.loadCurrentSeason();
      
      return { success: true };
    } catch (error) {
      console.error("Sezon güncelleme hatası:", error);
      return { success: false, error: error.message };
    }
  }

  // Admin: Kullanıcı oturumlarını getir
  async getUserSessions(kickName, limit = 10) {
    if (!this.db) return [];

    try {
      const snapshot = await this.db.collection('users').doc(kickName)
        .collection('sessions')
        .orderBy('startTime', 'desc')
        .limit(limit)
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Kullanıcı oturumlarını getirme hatası:", error);
      return [];
    }
  }

  // Admin: Kullanıcı detaylarını getir
  async getUserDetails(kickName) {
    if (!this.db) return null;

    try {
      // Kullanıcı bilgilerini al
      const userDoc = await this.db.collection('users').doc(kickName).get();
      
      if (!userDoc.exists) {
        return null;
      }
      
      // Kullanıcı skorunu al
      const scoreDoc = await this.db.collection('scores').doc(kickName).get();
      const score = scoreDoc.exists ? scoreDoc.data().score : 0;
      
      // Son oturumları al
      const sessionsSnapshot = await this.db.collection('users').doc(kickName)
        .collection('sessions')
        .orderBy('startTime', 'desc')
        .limit(5)
        .get();
      
      const sessions = sessionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sezon skorlarını al
      let seasonScores = [];
      if (this.currentSeason) {
        const seasonScoreDoc = await this.db.collection('seasons').doc(this.currentSeason.id)
          .collection('scores').doc(kickName).get();
        
        if (seasonScoreDoc.exists) {
          seasonScores.push({
            seasonId: this.currentSeason.id,
            seasonName: this.currentSeason.name,
            ...seasonScoreDoc.data()
          });
        }
      }
      
      return {
        id: userDoc.id,
        ...userDoc.data(),
        currentScore: score,
        recentSessions: sessions,
        seasonScores: seasonScores
      };
    } catch (error) {
      console.error("Kullanıcı detayları getirme hatası:", error);
      return null;
    }
  }
}

// Tek bir global örnek oluştur
const firebaseClient = new FirebaseClient();
