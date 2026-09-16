import React, { useState, useEffect } from 'react';
import { CharacterState } from '@octo/character';

interface CharacterProps {
  state: CharacterState;
  size?: number; // default 180
  onClick?: () => void;
}

export const Character: React.FC<CharacterProps> = ({ state, size = 180, onClick }) => {
  const [blink, setBlink] = useState(false);
  const [mouthPhase, setMouthPhase] = useState(0);

  // Blinking loop for natural aliveness
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 200);
    }, 4500);
    return () => clearInterval(blinkInterval);
  }, []);

  // Speaking mouth movement loop
  useEffect(() => {
    if (state !== 'SPEAKING') return;
    const interval = setInterval(() => {
      setMouthPhase((prev) => (prev + 1) % 4);
    }, 140);
    return () => clearInterval(interval);
  }, [state]);

  // Color mapping based on state
  const stateTheme = {
    IDLE: { core: '#06b6d4', glow: 'rgba(6, 182, 212, 0.4)', antenna: '#22d3ee', accent: '#0891b2' },
    LISTENING: { core: '#3b82f6', glow: 'rgba(59, 130, 246, 0.6)', antenna: '#60a5fa', accent: '#2563eb' },
    THINKING: { core: '#a855f7', glow: 'rgba(168, 85, 247, 0.6)', antenna: '#c084fc', accent: '#9333ea' },
    EXECUTING: { core: '#f97316', glow: 'rgba(249, 115, 22, 0.6)', antenna: '#fb923c', accent: '#ea580c' },
    SPEAKING: { core: '#10b981', glow: 'rgba(16, 185, 129, 0.6)', antenna: '#34d399', accent: '#059669' },
    SUCCESS: { core: '#10b981', glow: 'rgba(16, 185, 129, 0.8)', antenna: '#34d399', accent: '#047857' },
    ERROR: { core: '#ef4444', glow: 'rgba(239, 68, 68, 0.7)', antenna: '#f87171', accent: '#dc2626' },
    WAITING_FOR_CONFIRMATION: { core: '#f59e0b', glow: 'rgba(245, 158, 11, 0.7)', antenna: '#fbbf24', accent: '#d97706' },
  }[state];

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-105 select-none app-no-drag"
      style={{ width: `${size}px`, height: `${size}px` }}
      title={`Octo: ${state} (Click to interact)`}
    >
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full drop-shadow-2xl animate-float overflow-visible"
      >
        <defs>
          <radialGradient id="octoGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={stateTheme.glow} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#374151" />
            <stop offset="50%" stopColor="#1f2937" />
            <stop offset="100%" stopColor="#111827" />
          </linearGradient>
          <linearGradient id="visorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
        </defs>

        {/* Ambient aura glow behind character */}
        <circle cx="100" cy="105" r="75" fill="url(#octoGlow)" className="animate-glow" />

        {/* Floating Left & Right magnetic thruster hands */}
        <g className="transition-all duration-300">
          <circle cx="28" cy="115" r="12" fill="#1f2937" stroke={stateTheme.accent} strokeWidth="2" />
          <circle cx="28" cy="115" r="5" fill={stateTheme.core} />
          <circle cx="172" cy="115" r="12" fill="#1f2937" stroke={stateTheme.accent} strokeWidth="2" />
          <circle cx="172" cy="115" r="5" fill={stateTheme.core} />
        </g>

        {/* Antenna stalk & glowing tip */}
        <line x1="100" y1="42" x2="100" y2="18" stroke="#4b5563" strokeWidth="4" strokeLinecap="round" />
        <circle
          cx="100"
          cy="16"
          r={state === 'LISTENING' ? 8 : 6}
          fill={stateTheme.antenna}
          stroke="#ffffff"
          strokeWidth="1.5"
          className={state === 'LISTENING' || state === 'THINKING' ? 'animate-pulse' : ''}
        />

        {/* Listening radar waves from antenna */}
        {state === 'LISTENING' && (
          <g stroke={stateTheme.antenna} strokeWidth="1.5" fill="none" opacity="0.8">
            <path d="M 85 10 A 18 18 0 0 1 115 10" />
            <path d="M 75 4 A 28 28 0 0 1 125 4" />
          </g>
        )}

        {/* Robotic Head / Body Chassis */}
        <rect
          x="48"
          y="42"
          width="104"
          height="100"
          rx="32"
          fill="url(#bodyGrad)"
          stroke="#4b5563"
          strokeWidth="2.5"
        />

        {/* Head Side Ear Caps */}
        <rect x="40" y="72" width="9" height="24" rx="4" fill="#374151" stroke={stateTheme.accent} strokeWidth="1.5" />
        <rect x="151" y="72" width="9" height="24" rx="4" fill="#374151" stroke={stateTheme.accent} strokeWidth="1.5" />

        {/* High-tech Visor screen */}
        <rect
          x="58"
          y="56"
          width="84"
          height="54"
          rx="18"
          fill="url(#visorGrad)"
          stroke="#334155"
          strokeWidth="2"
        />

        {/* Visor Glare highlight */}
        <path
          d="M 64 64 Q 100 58 136 64"
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        {/* DYNAMIC EYES & VISOR DISPLAY BASED ON STATE */}
        {state === 'IDLE' && (
          <g fill={stateTheme.core}>
            {blink ? (
              <>
                <line x1="72" y1="80" x2="88" y2="80" stroke={stateTheme.core} strokeWidth="3" strokeLinecap="round" />
                <line x1="112" y1="80" x2="128" y2="80" stroke={stateTheme.core} strokeWidth="3" strokeLinecap="round" />
              </>
            ) : (
              <>
                <ellipse cx="80" cy="80" rx="7" ry="9" />
                <ellipse cx="120" cy="80" rx="7" ry="9" />
                <circle cx="82" cy="77" r="2.5" fill="#ffffff" />
                <circle cx="122" cy="77" r="2.5" fill="#ffffff" />
              </>
            )}
          </g>
        )}

        {state === 'LISTENING' && (
          <g fill={stateTheme.core}>
            <ellipse cx="80" cy="78" rx="8" ry="11" />
            <ellipse cx="120" cy="78" rx="8" ry="11" />
            <circle cx="83" cy="75" r="3" fill="#ffffff" />
            <circle cx="123" cy="75" r="3" fill="#ffffff" />
            {/* Audio waveform under eyes */}
            <line x1="92" y1="88" x2="92" y2="94" stroke={stateTheme.core} strokeWidth="2" strokeLinecap="round" />
            <line x1="97" y1="85" x2="97" y2="97" stroke={stateTheme.core} strokeWidth="2" strokeLinecap="round" />
            <line x1="102" y1="87" x2="102" y2="95" stroke={stateTheme.core} strokeWidth="2" strokeLinecap="round" />
            <line x1="107" y1="89" x2="107" y2="93" stroke={stateTheme.core} strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {state === 'THINKING' && (
          <g>
            {/* Curious asymmetric eyes */}
            <ellipse cx="78" cy="76" rx="8" ry="9" fill={stateTheme.core} />
            <ellipse cx="122" cy="82" rx="6" ry="7" fill={stateTheme.core} />
            <circle cx="81" cy="73" r="2.5" fill="#ffffff" />
            {/* Thinking gear / halo rotating */}
            <circle
              cx="100"
              cy="34"
              r="8"
              stroke={stateTheme.core}
              strokeWidth="2"
              strokeDasharray="4 3"
              fill="none"
              className="animate-spin"
            />
          </g>
        )}

        {state === 'EXECUTING' && (
          <g>
            {/* Scanning visor laser slit */}
            <rect x="66" y="78" width="68" height="6" rx="3" fill="#334155" />
            <rect x="80" y="77" width="24" height="8" rx="4" fill={stateTheme.core} className="animate-pulse" />
            {/* Scanning radar indicator */}
            <circle cx="100" cy="81" r="3" fill="#ffffff" />
          </g>
        )}

        {state === 'SPEAKING' && (
          <g fill={stateTheme.core}>
            {/* Expressive speaking eyes */}
            <ellipse cx="80" cy="76" rx="7" ry="8" />
            <ellipse cx="120" cy="76" rx="7" ry="8" />
            <circle cx="82" cy="74" r="2" fill="#ffffff" />
            <circle cx="122" cy="74" r="2" fill="#ffffff" />
            {/* Animated rhythmic speaking mouth */}
            <path
              d={
                mouthPhase === 0
                  ? 'M 92 90 Q 100 96 108 90'
                  : mouthPhase === 1
                  ? 'M 90 89 Q 100 100 110 89'
                  : mouthPhase === 2
                  ? 'M 93 91 Q 100 97 107 91'
                  : 'M 91 90 Q 100 102 109 90'
              }
              stroke={stateTheme.core}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        )}

        {state === 'SUCCESS' && (
          <g stroke={stateTheme.core} strokeWidth="3.5" fill="none" strokeLinecap="round">
            {/* Joyful happy crescent eyes */}
            <path d="M 72 82 Q 80 72 88 82" />
            <path d="M 112 82 Q 120 72 128 82" />
            {/* Smiling happy mouth */}
            <path d="M 90 92 Q 100 101 110 92" />
          </g>
        )}

        {state === 'ERROR' && (
          <g stroke={stateTheme.core} strokeWidth="3" strokeLinecap="round">
            {/* Cross / spiral eyes */}
            <line x1="74" y1="74" x2="86" y2="86" />
            <line x1="86" y1="74" x2="74" y2="86" />
            <line x1="114" y1="74" x2="126" y2="86" />
            <line x1="126" y1="74" x2="114" y2="86" />
            {/* Wavy disappointed mouth */}
            <path d="M 90 95 Q 95 90 100 95 T 110 95" fill="none" />
          </g>
        )}

        {state === 'WAITING_FOR_CONFIRMATION' && (
          <g fill={stateTheme.core}>
            {/* Questioning eyebrows & wide alert eyes */}
            <ellipse cx="80" cy="78" rx="7" ry="8" />
            <ellipse cx="120" cy="78" rx="7" ry="8" />
            <circle cx="82" cy="76" r="2" fill="#ffffff" />
            <circle cx="122" cy="76" r="2" fill="#ffffff" />
            {/* Question mark centered in mouth region */}
            <text x="100" y="97" fill={stateTheme.core} fontSize="12" fontWeight="bold" textAnchor="middle">
              ?
            </text>
          </g>
        )}

        {/* Chest Pulsing Core Reactor */}
        <circle cx="100" cy="124" r="10" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
        <circle
          cx="100"
          cy="124"
          r="6"
          fill={stateTheme.core}
          className="animate-pulse"
        />

        {/* Small badge label for status indicator */}
        <rect
          x="62"
          y="146"
          width="76"
          height="16"
          rx="8"
          fill="#111827"
          stroke={stateTheme.accent}
          strokeWidth="1"
        />
        <text
          x="100"
          y="157"
          fill="#e2e8f0"
          fontSize="7.5"
          fontWeight="700"
          textAnchor="middle"
          letterSpacing="0.6"
        >
          {state}
        </text>
      </svg>
    </div>
  );
};
