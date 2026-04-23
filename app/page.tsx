'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

// Types
type GameState = 'START' | 'COUNTDOWN' | 'PLAYING' | 'GAMEOVER' | 'WIN';

interface Brick {
  x: number;
  y: number;
  status: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
}

export default function BlockGame() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [playerName, setPlayerName] = useState('');
  const [lives, setLives] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [leaderboard, setLeaderboard] = useState<{ name: string; finishtime: number; timestamp: string }[]>([]);
  const [isPaused, setIsPaused] = useState(false);

  const audioCtx = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Audio
  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.current.state === 'suspended') {
      audioCtx.current.resume();
    }
    if (!bgmRef.current) {
      bgmRef.current = new Audio('/Hyper_Speed_Run.mp3');
      bgmRef.current.loop = true;
      bgmRef.current.volume = 0.3;
    }
    bgmRef.current.play().catch(e => console.log("Audio play blocked", e));
  };

  const playHitSound = (freq = 800) => {
    if (!audioCtx.current) return;
    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.current.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.current.destination);
    osc.start();
    osc.stop(audioCtx.current.currentTime + 0.1);
  };

  const playFireworkSound = () => {
    if (!audioCtx.current) return;
    if (audioCtx.current.state === 'suspended') {
      audioCtx.current.resume();
    }
    
    const now = audioCtx.current.currentTime;
    
    // 1. Victory Fanfare (C Major Arpeggio: C4, E4, G4, C5)
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((freq, index) => {
      const noteOsc = audioCtx.current!.createOscillator();
      const noteGain = audioCtx.current!.createGain();
      
      // Use 'sine' for a bright, clean game-like tone
      noteOsc.type = 'sine';
      noteOsc.frequency.setValueAtTime(freq, now + index * 0.12);
      
      const startTime = now + index * 0.12;
      // Last note is held longer
      const duration = index === notes.length - 1 ? 1.5 : 0.15;
      
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.linearRampToValueAtTime(0.4, startTime + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      noteOsc.connect(noteGain);
      noteGain.connect(audioCtx.current!.destination);
      
      noteOsc.start(startTime);
      noteOsc.stop(startTime + duration);
    });

    // 2. Bright Firework Explosion (Starts with the last note)
    const explosionTime = now + (notes.length - 1) * 0.12;
    
    // High pitched whistle/shimmer
    const popOsc = audioCtx.current.createOscillator();
    const popGain = audioCtx.current.createGain();
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(1200, explosionTime);
    popOsc.frequency.exponentialRampToValueAtTime(100, explosionTime + 0.6);
    
    popGain.gain.setValueAtTime(0, explosionTime);
    popGain.gain.linearRampToValueAtTime(0.5, explosionTime + 0.05);
    popGain.gain.exponentialRampToValueAtTime(0.01, explosionTime + 0.6);
    
    popOsc.connect(popGain);
    popGain.connect(audioCtx.current.destination);
    popOsc.start(explosionTime);
    popOsc.stop(explosionTime + 0.6);

    // Crackle (Noise burst)
    const bufferSize = Math.floor(audioCtx.current.sampleRate * 0.5); 
    if (bufferSize > 0) {
      const buffer = audioCtx.current.createBuffer(1, bufferSize, audioCtx.current.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) {
        // Create white noise
        data[j] = Math.random() * 2 - 1;
      }
      
      const noiseSource = audioCtx.current.createBufferSource();
      noiseSource.buffer = buffer;
      
      const filter = audioCtx.current.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3000;
      
      const noiseGain = audioCtx.current.createGain();
      noiseGain.gain.setValueAtTime(0, explosionTime);
      noiseGain.gain.linearRampToValueAtTime(0.3, explosionTime + 0.05);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, explosionTime + 0.5);
      
      noiseSource.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(audioCtx.current.destination);
      
      noiseSource.start(explosionTime);
    }
  };
  const gameVars = useRef({
    ball: { x: 0, y: 0, dx: 4, dy: -4, radius: 8 },
    paddle: { x: 0, width: 120, height: 12, speed: 8 },
    bricks: [] as Brick[][],
    particles: [] as Particle[],
    redBricksDestroyed: 0,
    keys: { left: false, right: false },
    isPaused: false,
    seconds: 0,
  });

  const brickConfig = {
    rows: 5,
    cols: 8,
    width: 85,
    height: 25,
    padding: 12,
    offsetTop: 60,
    offsetLeft: 30,
  };

  const colors = {
    red: '#FF4D4D',
    orange: '#FFA64D',
    yellow: '#FFFF4D',
    blue: '#4D94FF',
    green: '#4DFF4D',
    purple: '#B34DFF',
    accent: '#00F2FF', // Neon Cyan
  };

  // Initialize Game
  const initGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    gameVars.current.ball.x = canvas.width / 2;
    gameVars.current.ball.y = canvas.height - 40;
    gameVars.current.ball.dx = 4 * (Math.random() > 0.5 ? 1 : -1);
    gameVars.current.ball.dy = -4;
    gameVars.current.paddle.x = (canvas.width - gameVars.current.paddle.width) / 2;
    gameVars.current.redBricksDestroyed = 0;
    gameVars.current.particles = [];
    gameVars.current.isPaused = false;
    gameVars.current.seconds = 0;
    setIsPaused(false);

    // Init Bricks
    const brickColors = [];
    const totalBricks = brickConfig.rows * brickConfig.cols;
    const redCount = Math.floor(totalBricks * 0.3);

    for (let i = 0; i < redCount; i++) brickColors.push(colors.red);
    const otherColors = [colors.orange, colors.yellow, colors.blue, colors.green, colors.purple];
    for (let i = 0; i < totalBricks - redCount; i++) {
      brickColors.push(otherColors[Math.floor(Math.random() * otherColors.length)]);
    }
    brickColors.sort(() => Math.random() - 0.5);

    const newBricks: Brick[][] = [];
    let colorIdx = 0;
    for (let c = 0; c < brickConfig.cols; c++) {
      newBricks[c] = [];
      for (let r = 0; r < brickConfig.rows; r++) {
        newBricks[c][r] = { x: 0, y: 0, status: 1, color: brickColors[colorIdx++] };
      }
    }
    gameVars.current.bricks = newBricks;
  };

  // Game Loop
  const update = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Bricks
    drawBricks(ctx);

    if (gameState === 'PLAYING') {
      if (!gameVars.current.isPaused) {
        movePaddle(canvas);
        moveBall(canvas);
        collisionDetection();
      }
      drawBall(ctx);
      drawPaddle(ctx);
    } else if (gameState === 'WIN') {
      drawWinEffect(ctx, canvas);
    } else if (gameState === 'COUNTDOWN') {
      drawBall(ctx);
      drawPaddle(ctx);
    }

    requestRef.current = requestAnimationFrame(update);
  };

  const drawBall = (ctx: CanvasRenderingContext2D) => {
    const { x, y, radius } = gameVars.current.ball;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#FFF';
    ctx.fill();
    ctx.closePath();
    ctx.shadowBlur = 0;
  };

  const drawPaddle = (ctx: CanvasRenderingContext2D) => {
    const { x, width, height } = gameVars.current.paddle;
    const canvas = canvasRef.current!;
    const y = canvas.height - height - 15;

    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 6);
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, '#00F2FF');
    gradient.addColorStop(1, '#7000FF');
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00F2FF';
    ctx.fill();
    ctx.closePath();
    ctx.shadowBlur = 0;
  };

  const drawBricks = (ctx: CanvasRenderingContext2D) => {
    gameVars.current.bricks.forEach((column, c) => {
      column.forEach((brick, r) => {
        if (brick.status === 1) {
          const bx = c * (brickConfig.width + brickConfig.padding) + brickConfig.offsetLeft;
          const by = r * (brickConfig.height + brickConfig.padding) + brickConfig.offsetTop;
          brick.x = bx;
          brick.y = by;

          ctx.beginPath();
          ctx.roundRect(bx, by, brickConfig.width, brickConfig.height, 4);
          ctx.fillStyle = brick.color;

          // Glossy effect
          const grad = ctx.createLinearGradient(bx, by, bx, by + brickConfig.height);
          grad.addColorStop(0, brick.color);
          grad.addColorStop(1, 'rgba(0,0,0,0.3)');
          ctx.fillStyle = grad;

          ctx.fill();
          // Border
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.stroke();
          ctx.closePath();
        }
      });
    });
  };

  const movePaddle = (canvas: HTMLCanvasElement) => {
    const { keys, paddle } = gameVars.current;
    if (keys.right && paddle.x < canvas.width - paddle.width) {
      paddle.x += paddle.speed;
    } else if (keys.left && paddle.x > 0) {
      paddle.x -= paddle.speed;
    }
  };

  const moveBall = (canvas: HTMLCanvasElement) => {
    const { ball, paddle } = gameVars.current;

    // Wall bounce
    if (ball.x + ball.dx > canvas.width - ball.radius || ball.x + ball.dx < ball.radius) {
      ball.dx = -ball.dx;
    }
    if (ball.y + ball.dy < ball.radius) {
      ball.dy = -ball.dy;
    } else if (ball.y + ball.dy > canvas.height - ball.radius - 15) {
      // Paddle hit
      if (ball.x > paddle.x && ball.x < paddle.x + paddle.width) {
        ball.dy = -ball.dy;
        // Hit angle change
        const hitPoint = ball.x - (paddle.x + paddle.width / 2);
        ball.dx = hitPoint * 0.12;
      } else if (ball.y + ball.dy > canvas.height - ball.radius) {
        // Fall down
        handleLifeLoss();
      }
    }

    ball.x += ball.dx;
    ball.y += ball.dy;
  };

  const collisionDetection = () => {
    const { ball, bricks } = gameVars.current;
    bricks.forEach((column) => {
      column.forEach((b) => {
        if (b.status === 1) {
          if (
            ball.x > b.x &&
            ball.x < b.x + brickConfig.width &&
            ball.y > b.y &&
            ball.y < b.y + brickConfig.height
          ) {
            ball.dy = -ball.dy;
            b.status = 0;
            playHitSound(b.color === colors.red ? 1200 : 800);

            if (b.color === colors.red) {
              gameVars.current.redBricksDestroyed++;
              if (gameVars.current.redBricksDestroyed >= 3) {
                handleWin();
              }
            }
          }
        }
      });
    });
  };

  const handleLifeLoss = () => {
    setLives((prev) => {
      const next = prev - 1;
      if (next <= 0) {
        setGameState('GAMEOVER');
        if (bgmRef.current) {
          bgmRef.current.pause();
          bgmRef.current.currentTime = 0;
        }
      } else {
        resetBallPos();
      }
      return next;
    });
  };

  const resetBallPos = () => {
    const canvas = canvasRef.current!;
    gameVars.current.ball.x = canvas.width / 2;
    gameVars.current.ball.y = canvas.height - 40;
    gameVars.current.ball.dx = 4 * (Math.random() > 0.5 ? 1 : -1);
    gameVars.current.ball.dy = -4;
    gameVars.current.paddle.x = (canvas.width - gameVars.current.paddle.width) / 2;
  };

  const handleWin = () => {
    setGameState('WIN');
    createParticles();
    playFireworkSound();
    saveScore();
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.currentTime = 0;
    }
  };

  const createParticles = () => {
    const canvas = canvasRef.current!;
    for (let i = 0; i < 100; i++) {
      gameVars.current.particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        color: Object.values(colors)[Math.floor(Math.random() * Object.values(colors).length)],
        life: 1.0,
      });
    }
  };

  const drawWinEffect = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.fillStyle = 'rgba(10, 10, 10, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    gameVars.current.particles.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fill();
      ctx.closePath();

      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.01;
    });
    ctx.globalAlpha = 1.0;
  };

  const saveScore = async () => {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbzEtKQyM9_CzhTNfo5WUKhQvz6BGWWYiCa76_55iZu8lzzuqZU5gpDai8oLtEmx0yM-/exec";
    const name = encodeURIComponent(playerName || "Anonymous");
    const time = gameVars.current.seconds;
    const finalUrl = `${GAS_URL}?name=${name}&finishtime=${time}`;

    try {
      // Optimistic update
      const newEntry = { name: playerName || "Anonymous", finishtime: time, timestamp: new Date().toISOString() };
      setLeaderboard(prev => {
        const combined = [...prev, newEntry];
        return combined.sort((a, b) => {
          if (a.finishtime !== b.finishtime) return a.finishtime - b.finishtime;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }).slice(0, 3);
      });

      // Prepare form data for robust transmission
      const formData = new URLSearchParams();
      formData.append("timestamp", new Date().toLocaleString());
      formData.append("name", playerName || "Anonymous");
      formData.append("finishtime", time.toString());

      // Save to server using POST with URLSearchParams (mimics standard form submit)
      await fetch(GAS_URL, { 
        method: 'POST',
        mode: 'no-cors',
        body: formData
      });

      // Refresh from server after a delay
      setTimeout(async () => {
        try {
          const getResponse = await fetch(GAS_URL);
          const data = await getResponse.json();
          if (data.leaderboard) {
            setLeaderboard(data.leaderboard.slice(0, 3));
          }
        } catch (err) {
          console.error("Fetch Error:", err);
        }
      }, 3000); // 3 seconds for Google Sheets to sync

    } catch (error) {
      console.error("Leaderboard Save Error:", error);
    }
  };

  // Effects
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Right') gameVars.current.keys.right = true;
      if (e.key === 'ArrowLeft' || e.key === 'Left') gameVars.current.keys.left = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Right') gameVars.current.keys.right = false;
      if (e.key === 'ArrowLeft' || e.key === 'Left') gameVars.current.keys.left = false;
    };
    const handleTouch = (e: TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || gameVars.current.isPaused) return;
      
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const relativeX = touch.clientX - rect.left;
      
      // Scale touch position to internal coordinates (800 width)
      const scaleX = canvas.width / rect.width;
      const x = relativeX * scaleX;
      
      // Update paddle position (center on touch)
      const paddleWidth = gameVars.current.paddle.width;
      let newX = x - paddleWidth / 2;
      
      if (newX < 0) newX = 0;
      if (newX > canvas.width - paddleWidth) newX = canvas.width - paddleWidth;
      
      gameVars.current.paddle.x = newX;
      
      if (e.cancelable) e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouch, { passive: false });
      canvas.addEventListener('touchmove', handleTouch, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouch);
        canvas.removeEventListener('touchmove', handleTouch);
      }
    };
  }, []);

  useEffect(() => {
    if (gameState === 'COUNTDOWN') {
      initGame();
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setGameState('PLAYING');
            return 3;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'PLAYING' && !isPaused) {
      const interval = setInterval(() => {
        setSeconds((prev) => {
          const next = prev + 1;
          gameVars.current.seconds = next;
          return next;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState, isPaused]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState]);

  const startGame = () => {
    if (!playerName.trim()) {
      alert("이름을 입력해주세요!");
      return;
    }
    initAudio();
    setSeconds(0);
    setLives(3);
    setGameState('COUNTDOWN');
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center font-sans overflow-hidden relative">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Start Screen */}
      {gameState === 'START' && (
        <div className="z-10 flex flex-col items-center p-8 backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-500">
          <div className="relative w-48 h-48 mb-6 bg-white rounded-2xl overflow-hidden p-2 shadow-lg">
            <Image src="/mascot.jpg" alt="INU Mascot" fill className="object-contain" />
          </div>
          <h1 className="text-5xl font-black mb-2 tracking-tighter bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent uppercase">
            INU 벽돌깨기
          </h1>
          <p className="text-zinc-400 mb-8 font-medium">박주영 / GTS / 202600724</p>

          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 mb-8 w-full max-w-xs text-center">
            <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest block mb-1">Mission</span>
            <p className="text-sm text-zinc-300">Destroy <span className="text-red-400 font-bold">3 Red Blocks</span> to win!</p>
          </div>

          <div className="flex flex-col gap-4 w-full max-w-xs">
            <input
              type="text"
              placeholder="이름을 입력하세요"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="bg-black/50 border border-white/10 rounded-xl px-5 py-3 outline-none focus:ring-2 ring-cyan-500/50 transition-all text-center"
            />
            <button
              onClick={startGame}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:scale-105 active:scale-95 transition-all py-3 rounded-xl font-bold text-lg shadow-[0_0_20px_rgba(6,182,212,0.4)]"
            >
              START GAME
            </button>
          </div>
        </div>
      )}

      {/* Game Screen */}
      {(gameState === 'PLAYING' || gameState === 'COUNTDOWN' || gameState === 'WIN' || gameState === 'GAMEOVER') && (
        <div className="relative flex flex-col items-center gap-4 sm:gap-6 w-full max-w-[800px] px-4 sm:px-0 animate-in fade-in duration-700">
          {/* UI Header */}
          <div className="w-full flex justify-between items-center px-4 sm:px-6 py-3 sm:py-4 backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl">
            <div className="flex gap-8">
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">LIVES</span>
                <span className="text-xl font-black text-red-400">{'♥'.repeat(lives)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">TIME</span>
                <span className="text-xl font-mono text-cyan-400">{formatTime(seconds)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  const next = !isPaused;
                  setIsPaused(next);
                  gameVars.current.isPaused = next;
                  if (bgmRef.current) {
                    if (next) bgmRef.current.pause();
                    else bgmRef.current.play().catch(e => console.log(e));
                  }
                }}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${isPaused ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-white/5 hover:bg-white/10'}`}
              >
                {isPaused ? '계속하기' : '일시정지'}
              </button>
              <button
                onClick={() => {
                  setGameState('START');
                  if (bgmRef.current) {
                    bgmRef.current.pause();
                    bgmRef.current.currentTime = 0;
                  }
                }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors"
              >
                QUIT
              </button>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-zinc-900/50">
            <canvas ref={canvasRef} width={800} height={550} className="block w-full h-auto" />

            {isPaused && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                <h2 className="text-4xl font-black mb-6 tracking-widest text-cyan-400 uppercase drop-shadow-[0_0_15px_rgba(0,242,255,0.5)]">일시정지</h2>
                <button
                  onClick={() => {
                    setIsPaused(false);
                    gameVars.current.isPaused = false;
                    if (bgmRef.current) bgmRef.current.play().catch(e => console.log(e));
                  }}
                  className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:scale-105 transition-all active:scale-95"
                >
                  게임 계속하기
                </button>
              </div>
            )}

            {gameState === 'COUNTDOWN' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="text-[120px] font-black text-cyan-400 animate-pulse drop-shadow-[0_0_30px_rgba(0,242,255,0.5)]">
                  {countdown}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Result Screens */}
      {(gameState === 'GAMEOVER' || gameState === 'WIN') && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-500">
          <div className="bg-zinc-900 border border-white/10 p-10 rounded-[32px] text-center max-w-md w-full shadow-2xl">
            <h2 className={`text-5xl font-black mb-2 ${gameState === 'WIN' ? 'text-green-400' : 'text-red-500'}`}>
              {gameState === 'WIN' ? 'MISSION CLEAR' : 'GAME OVER'}
            </h2>
            <p className="text-zinc-400 mb-6">
              {gameState === 'WIN' ? `Congratulations, ${playerName}!` : 'Try again?'}
            </p>

            {gameState === 'WIN' && (
              <div className="mb-8">
                <div className="bg-white/5 rounded-2xl p-6 mb-6 border border-white/10">
                  <div className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-2">My Record</div>
                  <div className="text-4xl font-mono text-cyan-400 mb-2 drop-shadow-[0_0_15px_rgba(0,242,255,0.5)]">
                    {formatTime(seconds)}
                  </div>
                  <div className="text-sm font-bold text-yellow-400">
                    {leaderboard.findIndex(e => e.name === playerName && e.finishtime === seconds) !== -1 
                      ? `현재 ${leaderboard.findIndex(e => e.name === playerName && e.finishtime === seconds) + 1}위 달성! 🏆` 
                      : '아쉽게도 Top 3 진입 실패 😢'}
                  </div>
                </div>

                <div className="text-left bg-black/30 rounded-2xl p-6 border border-white/5">
                  <h3 className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-4">Top 3 Records</h3>
                  <div className="space-y-3">
                    {leaderboard.length > 0 ? (
                      leaderboard.map((entry, idx) => {
                        const isMe = entry.name === playerName && entry.finishtime === seconds;
                        return (
                          <div key={idx} className={`flex justify-between items-center p-2 rounded-lg ${isMe ? 'bg-cyan-500/20 border border-cyan-500/50' : ''}`}>
                            <span className="flex items-center gap-3">
                              <span className={`font-mono ${isMe ? 'text-cyan-400' : 'text-zinc-600'}`}>0{idx + 1}</span>
                              <span className={`font-bold ${isMe ? 'text-cyan-400' : 'text-white'}`}>{entry.name}</span>
                            </span>
                            <span className={`font-mono ${isMe ? 'text-cyan-400' : 'text-zinc-400'}`}>{formatTime(entry.finishtime)}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center text-zinc-600 py-4 text-xs animate-pulse">데이터 로딩 중...</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setGameState('START')}
              className="w-full bg-white text-black py-4 rounded-2xl font-bold text-lg hover:bg-zinc-200 transition-all active:scale-95"
            >
              BACK TO MAIN
            </button>
          </div>
        </div>
      )}

      <footer className="absolute bottom-6 text-[10px] text-zinc-600 tracking-[0.2em] uppercase">
        © 2026 INU Global Technology & Science
      </footer>
    </div>
  );
}
