class PointAndShoutGame {
    constructor() {
        this.players = [];
        this.currentRound = 1;
        this.maxRounds = 5;
        this.gameState = 'waiting'; // waiting, active, results, ended
        this.currentWord = '';
        this.roundStartTime = 0;
        this.responses = new Map(); // playerId -> {target, timestamp}
        this.currentPlayerName = '';
        this.audioContext = null;
        this.speechSynthesis = window.speechSynthesis;
        this.motionDetection = false;
        this.baseOrientation = null;
        this.pointingThreshold = 30; // degrees
        
        // Fun words that build suspense
        this.words = [
            'cook', 'look', 'book', 'hook', 'took',
            'shake', 'bake', 'make', 'wake', 'take',
            'jump', 'pump', 'bump', 'dump', 'lump',
            'dance', 'chance', 'prance', 'glance', 'stance',
            'SHOOT' // The action word!
        ];
        
        this.isHost = this.detectHost();
        this.playerId = this.generatePlayerId();
        
        this.initializeAudio();
        this.initializeEventListeners();
        this.showCorrectScreen();
        
        if (this.isHost) {
            // Delay QR code generation to ensure DOM is ready
            setTimeout(() => this.generateQRCode(), 100);
        }
    }
    
    detectHost() {
        // Simple detection: if URL has ?host=true or screen is large enough, or no join parameter
        const urlParams = new URLSearchParams(window.location.search);
        const isJoinUrl = urlParams.get('join') === 'true';
        const isHostUrl = urlParams.get('host') === 'true';
        
        if (isJoinUrl) return false;
        if (isHostUrl) return true;
        
        // Default: large screens are hosts, small screens are controllers
        return window.innerWidth > 1024;
    }
    
    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9);
    }
    
    showCorrectScreen() {
        if (this.isHost) {
            document.getElementById('host-screen').classList.add('active');
            document.getElementById('controller-screen').classList.remove('active');
        } else {
            document.getElementById('host-screen').classList.remove('active');
            document.getElementById('controller-screen').classList.add('active');
        }
    }
    
    initializeAudio() {
        // Initialize Web Audio API for sound effects
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
        }
    }
    
    generateQRCode() {
        const canvas = document.getElementById('qr-code');
        const joinUrlEl = document.getElementById('join-url');
        
        if (!canvas) {
            console.error('QR code canvas not found');
            return;
        }
        
        const baseUrl = window.location.href.split('?')[0];
        const joinUrl = `${baseUrl}?join=true`;
        
        // Always display the URL first
        if (joinUrlEl) {
            joinUrlEl.textContent = joinUrl;
        }
        
        // Try to generate QR code with multiple attempts
        let attempts = 0;
        const maxAttempts = 10;
        
        const generateQR = () => {
            attempts++;
            console.log(`QR generation attempt ${attempts}`);
            
            if (typeof QRCode !== 'undefined') {
                try {
                    // Clear canvas first
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    QRCode.toCanvas(canvas, joinUrl, {
                        width: 200,
                        height: 200,
                        margin: 2,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        }
                    }, (error) => {
                        if (error) {
                            console.error('QR Code generation failed:', error);
                            this.showQRFallback(canvas, joinUrlEl, joinUrl);
                        } else {
                            console.log('QR Code generated successfully!');
                            canvas.style.display = 'block';
                        }
                    });
                } catch (e) {
                    console.error('QR Code generation error:', e);
                    if (attempts < maxAttempts) {
                        setTimeout(generateQR, 1000);
                    } else {
                        this.showQRFallback(canvas, joinUrlEl, joinUrl);
                    }
                }
            } else {
                console.log('QRCode library not loaded yet...');
                if (attempts < maxAttempts) {
                    setTimeout(generateQR, 1000);
                } else {
                    console.error('QRCode library failed to load');
                    this.showQRFallback(canvas, joinUrlEl, joinUrl);
                }
            }
        };
        
        // Start generation immediately and also after a delay
        generateQR();
        setTimeout(generateQR, 2000);
    }
    
    showQRFallback(canvas, joinUrlEl, joinUrl) {
        canvas.style.display = 'none';
        if (joinUrlEl) {
            joinUrlEl.style.fontSize = '1.2rem';
            joinUrlEl.style.fontWeight = 'bold';
            joinUrlEl.style.padding = '20px';
            joinUrlEl.style.background = 'rgba(255,255,255,0.3)';
            joinUrlEl.style.borderRadius = '15px';
            joinUrlEl.innerHTML = `
                <div style="margin-bottom: 10px;">📱 Join URL:</div>
                <div style="font-family: monospace; word-break: break-all;">${joinUrl}</div>
                <div style="margin-top: 10px; font-size: 0.9rem; opacity: 0.8;">Copy this link to join on your phone</div>
            `;
        }
    }
    
    initializeEventListeners() {
        if (this.isHost) {
            this.initializeHostListeners();
        } else {
            this.initializeControllerListeners();
        }
    }
    
    initializeHostListeners() {
        document.getElementById('start-game').addEventListener('click', () => {
            this.startGame();
        });
        
        document.getElementById('next-round').addEventListener('click', () => {
            this.nextRound();
        });
        
        document.getElementById('end-game').addEventListener('click', () => {
            this.endGame();
        });
        
        // Listen for player join messages (in real app, this would be WebSocket/WebRTC)
        window.addEventListener('message', (event) => {
            console.log('Received message:', event.data);
            if (event.data.type === 'JOIN_GAME') {
                console.log(`Adding player via message: ${event.data.playerName}`);
                this.addPlayer(event.data.playerName);
            }
        });
        
        // Also listen for localStorage changes for same-device testing
        window.addEventListener('storage', (event) => {
            console.log('Storage event:', event.key, event.newValue);
            if (event.key === 'pointshoot_join') {
                try {
                    const joinData = JSON.parse(event.newValue || '{}');
                    if (joinData.playerName && joinData.timestamp > Date.now() - 10000) {
                        console.log(`Adding player via storage: ${joinData.playerName}`);
                        this.addPlayer(joinData.playerName);
                        // Clear the join request
                        localStorage.removeItem('pointshoot_join');
                    }
                } catch (e) {
                    console.error('Error parsing join data:', e);
                }
            }
        });
        
        // Poll for join requests every 2 seconds (fallback method)
        setInterval(() => {
            try {
                const joinRequest = localStorage.getItem('pointshoot_join');
                if (joinRequest) {
                    const joinData = JSON.parse(joinRequest);
                    if (joinData.playerName && joinData.timestamp > Date.now() - 5000) {
                        console.log(`Adding player via polling: ${joinData.playerName}`);
                        this.addPlayer(joinData.playerName);
                        localStorage.removeItem('pointshoot_join');
                    }
                }
            } catch (e) {
                // Ignore polling errors
            }
        }, 2000);
        
        // Test button for debugging
        const testJoinBtn = document.getElementById('test-join');
        if (testJoinBtn) {
            testJoinBtn.addEventListener('click', () => {
                const testName = `Player${this.players.length + 1}`;
                console.log(`Test adding player: ${testName}`);
                this.addPlayer(testName);
            });
        }
    }
    
    initializeControllerListeners() {
        document.getElementById('join-game').addEventListener('click', () => {
            const playerName = document.getElementById('player-name').value.trim();
            const roomCode = document.getElementById('room-code-input').value.trim();
            
            if (playerName && roomCode) {
                this.joinGame(playerName, roomCode);
            }
        });
        
        // Enter key support
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('join-game').click();
            }
        });
        
        // Request motion permissions
        this.requestMotionPermission();
    }
    
    async requestMotionPermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    this.enableMotionDetection();
                }
            } catch (error) {
                console.log('Motion permission denied or not supported');
            }
        } else if (window.DeviceOrientationEvent) {
            // Android or older iOS
            this.enableMotionDetection();
        }
    }
    
    enableMotionDetection() {
        this.motionDetection = true;
        window.addEventListener('deviceorientation', (event) => {
            this.handleDeviceOrientation(event);
        });
    }
    
    handleDeviceOrientation(event) {
        if (!this.baseOrientation) {
            // Calibrate base position when game starts
            this.baseOrientation = {
                alpha: event.alpha,
                beta: event.beta,
                gamma: event.gamma
            };
            return;
        }
        
        // Calculate pointing direction based on orientation change
        const deltaGamma = Math.abs(event.gamma - this.baseOrientation.gamma);
        const deltaBeta = Math.abs(event.beta - this.baseOrientation.beta);
        
        // Check if phone is being pointed (raised and tilted)
        if (deltaGamma > this.pointingThreshold || deltaBeta > this.pointingThreshold) {
            this.handlePhonePointing(event);
        }
    }
    
    handlePhonePointing(event) {
        // Only detect pointing during "SHOOT" phase
        if (this.gameState !== 'active' || !this.roundStartTime) return;
        
        // Determine pointing direction based on gamma (left/right tilt)
        const direction = event.gamma > this.baseOrientation.gamma ? 'right' : 'left';
        
        // Auto-select target based on direction
        this.autoSelectTarget(direction);
    }
    
    autoSelectTarget(direction) {
        const buttons = document.querySelectorAll('.point-button');
        if (buttons.length === 0) return;
        
        // Visual feedback for motion detection
        const motionStatus = document.getElementById('motion-status');
        if (motionStatus) {
            motionStatus.textContent = `📱 Pointing ${direction}!`;
            motionStatus.className = 'motion-status motion-pointing';
        }
        
        // Simple logic: left = first half of players, right = second half
        const targetIndex = direction === 'left' ? 
            Math.floor(buttons.length / 2) - 1 : 
            Math.floor(buttons.length / 2);
        
        const targetButton = buttons[Math.max(0, Math.min(targetIndex, buttons.length - 1))];
        
        if (targetButton && !targetButton.classList.contains('selected')) {
            targetButton.click();
            
            // Reset motion status after selection
            setTimeout(() => {
                if (motionStatus) {
                    motionStatus.textContent = '🎯 Target selected!';
                    motionStatus.className = 'motion-status motion-ready';
                }
            }, 1000);
        }
    }
    
    addPlayer(name) {
        const player = {
            id: this.generatePlayerId(),
            name: name,
            score: 0,
            connected: true,
            pointing: false,
            target: null
        };
        
        this.players.push(player);
        this.updatePlayersDisplay();
        this.updateStartButton();
    }
    
    updatePlayersDisplay() {
        const playersContainer = document.getElementById('players-list');
        const gamePlayersContainer = document.getElementById('game-players');
        const playerCountEl = document.getElementById('player-count');
        
        if (playerCountEl) {
            playerCountEl.textContent = this.players.length;
        }
        
        const playersHTML = this.players.map(player => `
            <div class="player-card ${player.pointing ? 'pointing' : ''}" data-player-id="${player.id}">
                <div class="player-name">${player.name}</div>
                <div class="player-status">
                    ${this.gameState === 'waiting' ? '🎮 Ready' : `🏆 ${player.score} points`}
                    ${player.pointing ? ' 👉' : ''}
                </div>
            </div>
        `).join('');
        
        if (playersContainer) playersContainer.innerHTML = playersHTML;
        if (gamePlayersContainer) gamePlayersContainer.innerHTML = playersHTML;
    }
    
    updateStartButton() {
        const startButton = document.getElementById('start-game');
        if (startButton) {
            startButton.disabled = this.players.length < 2;
            startButton.textContent = this.players.length < 2 ? 
                `Need ${2 - this.players.length} more players` : 
                `Start Game (${this.players.length} players)`;
        }
    }
    
    startGame() {
        this.gameState = 'active';
        this.currentRound = 1;
        this.showGameState('game-active');
        this.startRound();
    }
    
    startRound() {
        this.responses.clear();
        this.resetPlayerStates();
        this.updateRoundDisplay();
        
        // Start countdown
        this.startCountdown();
    }
    
    startCountdown() {
        let count = 3;
        const countdownEl = document.getElementById('countdown');
        const wordDisplay = document.getElementById('word-display');
        
        const countdown = setInterval(() => {
            if (count > 0) {
                countdownEl.textContent = count;
                wordDisplay.textContent = 'Get Ready...';
                count--;
            } else {
                clearInterval(countdown);
                countdownEl.textContent = '';
                this.playWordSequence();
            }
        }, 1000);
    }
    
    playWordSequence() {
        const wordDisplay = document.getElementById('word-display');
        let wordIndex = 0;
        const wordsToPlay = this.getRandomWords(3, 6); // 3-6 words before SHOOT
        
        const playNextWord = () => {
            if (wordIndex < wordsToPlay.length) {
                const word = wordsToPlay[wordIndex];
                wordDisplay.textContent = word.toUpperCase();
                wordDisplay.className = 'word-display';
                
                // Play sound effect (you can add actual audio here)
                this.playSound(word);
                
                wordIndex++;
                setTimeout(playNextWord, 1500); // 1.5 seconds between words
            } else {
                // Play SHOOT!
                this.playShootWord();
            }
        };
        
        playNextWord();
    }
    
    getRandomWords(min, max) {
        const count = Math.floor(Math.random() * (max - min + 1)) + min;
        const nonShootWords = this.words.filter(word => word !== 'SHOOT');
        const selectedWords = [];
        
        for (let i = 0; i < count; i++) {
            const randomIndex = Math.floor(Math.random() * nonShootWords.length);
            selectedWords.push(nonShootWords[randomIndex]);
        }
        
        return selectedWords;
    }
    
    playShootWord() {
        const wordDisplay = document.getElementById('word-display');
        wordDisplay.textContent = 'SHOOT!';
        wordDisplay.className = 'word-display shoot';
        
        this.roundStartTime = Date.now();
        this.playSound('SHOOT');
        
        // Enable pointing for controllers
        this.enablePointing();
        
        // Wait for responses (5 seconds max)
        setTimeout(() => {
            this.endRound();
        }, 5000);
    }
    
    enablePointing() {
        // This would send a signal to all controllers to show pointing interface
        // For demo, we'll simulate some responses
        setTimeout(() => this.simulatePlayerResponse('Alice', 'Bob'), 800);
        setTimeout(() => this.simulatePlayerResponse('Bob', 'Charlie'), 1200);
        setTimeout(() => this.simulatePlayerResponse('Charlie', 'Alice'), 1500);
        setTimeout(() => this.simulatePlayerResponse('Diana', 'Bob'), 2000);
    }
    
    simulatePlayerResponse(playerName, targetName) {
        const player = this.players.find(p => p.name === playerName);
        const target = this.players.find(p => p.name === targetName);
        
        if (player && target) {
            this.recordResponse(player.id, target.id);
        }
    }
    
    recordResponse(playerId, targetId) {
        if (!this.responses.has(playerId)) {
            const timestamp = Date.now() - this.roundStartTime;
            this.responses.set(playerId, { target: targetId, timestamp });
            
            // Update visual feedback
            const player = this.players.find(p => p.id === playerId);
            if (player) {
                player.pointing = true;
                player.target = targetId;
                this.updatePlayersDisplay();
            }
        }
    }
    
    endRound() {
        const results = this.calculateRoundResults();
        this.showRoundResults(results);
    }
    
    calculateRoundResults() {
        const responses = Array.from(this.responses.entries()).map(([playerId, data]) => ({
            playerId,
            targetId: data.target,
            timestamp: data.timestamp,
            player: this.players.find(p => p.id === playerId)
        }));
        
        // Sort by response time (fastest first)
        responses.sort((a, b) => a.timestamp - b.timestamp);
        
        let winner = null;
        if (responses.length > 0) {
            winner = responses[0];
            // Award point to fastest responder
            winner.player.score += 1;
        }
        
        return {
            winner,
            responses,
            totalResponses: responses.length,
            totalPlayers: this.players.length
        };
    }
    
    showRoundResults(results) {
        this.gameState = 'results';
        this.showGameState('results');
        
        const resultsContainer = document.getElementById('round-results');
        let resultsHTML = '';
        
        if (results.winner) {
            resultsHTML += `
                <div class="winner-announcement">
                    🏆 <strong>${results.winner.player.name}</strong> wins this round!
                    <br><small>Response time: ${results.winner.timestamp}ms</small>
                </div>
                <div class="round-details">
                    <h4>Round Rankings:</h4>
                    ${results.responses.map((r, index) => `
                        <div>${index + 1}. ${r.player.name} → ${this.players.find(p => p.id === r.targetId)?.name} <small>(${r.timestamp}ms)</small></div>
                    `).join('')}
                </div>
            `;
        } else {
            resultsHTML = '<div class="no-winner">No one pointed in time! 😅<br><small>Be faster next round!</small></div>';
        }
        
        resultsContainer.innerHTML = resultsHTML;
        
        // Highlight winner
        if (results.winner) {
            const winnerCard = document.querySelector(`[data-player-id="${results.winner.playerId}"]`);
            if (winnerCard) {
                winnerCard.classList.add('winner');
            }
        }
        
        // Show result on controller devices
        this.showControllerResults(results);
    }
    
    showControllerResults(results) {
        if (this.isHost) return;
        
        const resultDisplay = document.getElementById('result-display');
        const resultIcon = document.getElementById('result-icon');
        const resultText = document.getElementById('result-text');
        const resultDetails = document.getElementById('result-details');
        
        // Check if current player won
        const playerWon = results.winner && results.winner.player.name === this.currentPlayerName;
        const playerResponse = results.responses.find(r => r.player.name === this.currentPlayerName);
        
        if (playerWon) {
            resultDisplay.className = 'result-display win';
            resultIcon.textContent = '🏆';
            resultText.textContent = 'YOU WIN!';
            resultDetails.innerHTML = `
                <div>🎉 Congratulations! 🎉</div>
                <div>Response time: ${results.winner.timestamp}ms</div>
                <div>You were the fastest!</div>
            `;
            this.playWinSound();
        } else if (playerResponse) {
            resultDisplay.className = 'result-display lose';
            resultIcon.textContent = '😅';
            resultText.textContent = 'Not This Time!';
            const ranking = results.responses.findIndex(r => r.player.name === this.currentPlayerName) + 1;
            resultDetails.innerHTML = `
                <div>You finished #${ranking}</div>
                <div>Response time: ${playerResponse.timestamp}ms</div>
                <div>Better luck next round!</div>
            `;
            this.playLoseSound();
        } else {
            resultDisplay.className = 'result-display lose';
            resultIcon.textContent = '⏰';
            resultText.textContent = 'Too Slow!';
            resultDetails.innerHTML = `
                <div>You didn't point in time</div>
                <div>Be ready for "SHOOT!" next round</div>
            `;
            this.playLoseSound();
        }
        
        this.showControllerState('controller-result');
        
        // Auto return to game after 4 seconds
        setTimeout(() => {
            if (this.gameState === 'active') {
                this.showControllerState('controller-active');
            }
        }, 4000);
    }
    
    playWinSound() {
        if (!this.audioContext) return;
        
        try {
            // Play a victory melody
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, C
            notes.forEach((freq, index) => {
                setTimeout(() => {
                    const oscillator = this.audioContext.createOscillator();
                    const gainNode = this.audioContext.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);
                    
                    oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                    
                    oscillator.start(this.audioContext.currentTime);
                    oscillator.stop(this.audioContext.currentTime + 0.3);
                }, index * 150);
            });
        } catch (e) {
            console.log('Win sound failed:', e);
        }
    }
    
    playLoseSound() {
        if (!this.audioContext) return;
        
        try {
            // Play a "try again" sound
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.5);
            gainNode.gain.setValueAtTime(0.15, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.5);
        } catch (e) {
            console.log('Lose sound failed:', e);
        }
    }
    
    nextRound() {
        this.currentRound++;
        if (this.currentRound <= this.maxRounds) {
            this.gameState = 'active';
            this.showGameState('game-active');
            
            // Reset controller interface
            if (!this.isHost) {
                this.showControllerState('controller-active');
                this.resetControllerInterface();
            }
            
            this.startRound();
        } else {
            this.endGame();
        }
    }
    
    resetControllerInterface() {
        const instruction = document.getElementById('game-instruction');
        instruction.textContent = 'Point to another player when you hear "SHOOT"!';
        instruction.style.background = 'rgba(255,255,255,0.2)';
        
        // Re-enable pointing buttons
        document.querySelectorAll('.point-button').forEach(btn => {
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
            btn.classList.remove('selected');
        });
    }
    
    endGame() {
        this.gameState = 'ended';
        // Show final scores
        const winner = this.players.reduce((prev, current) => 
            (prev.score > current.score) ? prev : current
        );
        
        alert(`🎉 Game Over! Winner: ${winner.name} with ${winner.score} points!`);
        this.resetGame();
    }
    
    resetGame() {
        this.currentRound = 1;
        this.gameState = 'waiting';
        this.players.forEach(player => {
            player.score = 0;
            player.pointing = false;
            player.target = null;
        });
        this.showGameState('waiting-area');
        this.updatePlayersDisplay();
    }
    
    resetPlayerStates() {
        this.players.forEach(player => {
            player.pointing = false;
            player.target = null;
        });
        this.updatePlayersDisplay();
    }
    
    updateRoundDisplay() {
        const roundEl = document.getElementById('current-round');
        if (roundEl) {
            roundEl.textContent = this.currentRound;
        }
    }
    
    showGameState(stateId) {
        document.querySelectorAll('.game-state').forEach(state => {
            state.classList.remove('active');
        });
        document.getElementById(stateId).classList.add('active');
    }
    
    playSound(word) {
        // Play text-to-speech pronunciation
        this.speakWord(word);
        
        // Also play sound effect
        if (!this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            if (word === 'SHOOT') {
                // Dramatic sound for SHOOT - play after speech
                setTimeout(() => {
                    const shootOsc = this.audioContext.createOscillator();
                    const shootGain = this.audioContext.createGain();
                    
                    shootOsc.connect(shootGain);
                    shootGain.connect(this.audioContext.destination);
                    
                    shootOsc.frequency.setValueAtTime(800, this.audioContext.currentTime);
                    shootOsc.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.3);
                    shootGain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
                    shootGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
                    shootOsc.start(this.audioContext.currentTime);
                    shootOsc.stop(this.audioContext.currentTime + 0.5);
                }, 500);
            } else {
                // Subtle beep before speech for other words
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + 0.1);
            }
        } catch (e) {
            console.log('Sound playback failed:', e);
        }
        
        console.log(`🔊 Playing sound: ${word}`);
    }
    
    speakWord(word) {
        if (!this.speechSynthesis) return;
        
        // Cancel any ongoing speech
        this.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(word);
        
        // Configure speech settings
        utterance.rate = word === 'SHOOT' ? 1.2 : 0.9; // Faster for SHOOT
        utterance.pitch = word === 'SHOOT' ? 1.3 : 1.0; // Higher pitch for SHOOT
        utterance.volume = 0.8;
        
        // Try to use a clear voice
        const voices = this.speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice => 
            voice.lang.startsWith('en') && 
            (voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.default)
        );
        
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        this.speechSynthesis.speak(utterance);
    }
    
    // Controller methods
    joinGame(playerName, roomCode) {
        console.log(`Player ${playerName} attempting to join...`);
        
        // Store player name for later use
        this.currentPlayerName = playerName;
        
        // Update display
        document.getElementById('player-name-display').textContent = playerName;
        this.showControllerState('controller-waiting');
        
        // For real cross-device communication, we need a different approach
        // Since we can't use localStorage across devices, let's use a simple polling system
        
        // Method 1: Try localStorage for same-device testing
        try {
            const joinData = {
                playerName: playerName,
                timestamp: Date.now(),
                id: this.playerId
            };
            
            localStorage.setItem('pointshoot_join', JSON.stringify(joinData));
            console.log('Join request sent via localStorage');
            
            // Trigger storage event manually for same tab
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'pointshoot_join',
                newValue: JSON.stringify(joinData)
            }));
            
        } catch (e) {
            console.log('localStorage failed:', e);
        }
        
        // Method 2: Try postMessage for different windows/tabs
        try {
            if (window.opener) {
                window.opener.postMessage({
                    type: 'JOIN_GAME',
                    playerName: playerName,
                    playerId: this.playerId
                }, '*');
                console.log('Join request sent via postMessage');
            }
        } catch (e) {
            console.log('postMessage failed:', e);
        }
        
        // Method 3: For demo purposes, add to global game instance
        if (window.game && window.game.isHost) {
            console.log('Adding player directly to host game');
            window.game.addPlayer(playerName);
        }
        
        // Show connection feedback
        setTimeout(() => {
            this.showControllerState('controller-active');
            this.setupPointingInterface();
        }, 2000);
    }
    
    setupPointingInterface() {
        // Check if motion detection is enabled
        const motionCheckbox = document.getElementById('motion-detection');
        const useMotion = motionCheckbox && motionCheckbox.checked;
        
        // Get other players from the global game instance or use stored players
        const currentPlayerName = document.getElementById('player-name-display').textContent;
        let otherPlayers = [];
        
        if (window.game && window.game.players) {
            otherPlayers = window.game.players
                .map(p => p.name)
                .filter(name => name !== currentPlayerName);
        } else {
            // Fallback for demo
            otherPlayers = this.players
                .map(p => p.name)
                .filter(name => name !== currentPlayerName);
        }
        
        const pointingContainer = document.getElementById('players-to-point');
        const motionStatus = document.getElementById('motion-status');
        
        if (otherPlayers.length === 0) {
            pointingContainer.innerHTML = '<div style="padding: 20px; opacity: 0.7;">Waiting for other players...</div>';
            return;
        }
        
        // Show/hide motion status
        if (useMotion && this.motionDetection) {
            motionStatus.style.display = 'block';
            motionStatus.textContent = '📱 Hold phone steady, then point when you hear "SHOOT!"';
            motionStatus.className = 'motion-status motion-ready';
        } else {
            motionStatus.style.display = 'none';
        }
        
        // Create player buttons (always show for fallback)
        pointingContainer.innerHTML = otherPlayers.map(name => `
            <button class="point-button" data-target="${name}">
                ${name}
            </button>
        `).join('');
        
        // Add click handlers
        pointingContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('point-button')) {
                // Remove previous selection
                document.querySelectorAll('.point-button').forEach(btn => {
                    btn.classList.remove('selected');
                });
                
                // Select this target
                e.target.classList.add('selected');
                
                // Send response to host
                const target = e.target.dataset.target;
                this.sendPointingResponse(target);
            }
        });
        
        // Calibrate motion detection when game starts
        if (useMotion && this.motionDetection) {
            this.calibrateMotion();
        }
    }
    
    calibrateMotion() {
        const motionStatus = document.getElementById('motion-status');
        if (motionStatus) {
            motionStatus.textContent = '🔄 Calibrating... Hold phone normally';
            motionStatus.className = 'motion-status motion-calibrating';
            
            // Reset base orientation for calibration
            this.baseOrientation = null;
            
            setTimeout(() => {
                if (motionStatus) {
                    motionStatus.textContent = '✅ Ready! Point your phone when you hear "SHOOT!"';
                    motionStatus.className = 'motion-status motion-ready';
                }
            }, 2000);
        }
    }
    
    sendPointingResponse(target) {
        // In a real implementation, this would send to the host
        console.log(`👉 Pointing at: ${target}`);
        
        // Visual feedback
        const instruction = document.getElementById('game-instruction');
        instruction.textContent = `You pointed at ${target}! 🎯`;
        instruction.style.background = 'rgba(81,207,102,0.3)';
        instruction.style.borderRadius = '15px';
        instruction.style.padding = '20px';
        
        // Disable further pointing
        document.querySelectorAll('.point-button').forEach(btn => {
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.6';
        });
    }
    
    showControllerState(stateId) {
        document.querySelectorAll('.controller-state').forEach(state => {
            state.classList.remove('active');
        });
        document.getElementById(stateId).classList.add('active');
    }
}

// Game initialization is now handled at the bottom of the file

// Add some helper text for users and enable audio
document.addEventListener('DOMContentLoaded', () => {
    // Add instructions for mobile users
    if (window.innerWidth <= 768 && !new URLSearchParams(window.location.search).get('host')) {
        const instruction = document.createElement('div');
        instruction.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 20px;
            border-radius: 15px;
            text-align: center;
            font-size: 1rem;
            z-index: 1000;
            backdrop-filter: blur(10px);
            border: 2px solid rgba(255,255,255,0.2);
        `;
        instruction.innerHTML = `
            📱 <strong>Controller Mode</strong><br>
            The main game screen should be on a larger device (TV/laptop)
            <button onclick="this.parentElement.remove()" style="margin-top: 10px; padding: 8px 15px; border: none; border-radius: 20px; background: #51cf66; color: white; font-weight: bold;">Got it! 🎮</button>
        `;
        document.body.appendChild(instruction);
    }
    
    // Enable audio context on first user interaction
    document.addEventListener('click', () => {
        if (window.game && window.game.audioContext && window.game.audioContext.state === 'suspended') {
            window.game.audioContext.resume();
        }
    }, { once: true });
});

// Store game instance globally for audio context access
document.addEventListener('DOMContentLoaded', () => {
    window.game = new PointAndShoutGame();
    
    // Load voices for speech synthesis
    if (window.speechSynthesis) {
        // Load voices
        window.speechSynthesis.getVoices();
        
        // Some browsers need this event
        window.speechSynthesis.addEventListener('voiceschanged', () => {
            window.speechSynthesis.getVoices();
        });
    }
});