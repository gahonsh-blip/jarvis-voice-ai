import React, { useState } from 'react';
import { X, Delete, RotateCcw, Calculator as CalcIcon } from 'lucide-react';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({ isOpen, onClose }) => {
  const [display, setDisplay] = useState<string>('0');
  const [equation, setEquation] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleInput = (val: string) => {
    setDisplay((prev) => {
      if (prev === '0' || prev === 'Error') return val;
      return prev + val;
    });
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
  };

  const handleDelete = () => {
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  const handleCalculate = () => {
    try {
      // Safe math evaluator
      const sanitized = display.replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').trim();
      // Ensure only numbers, decimal points, basic operators, and parentheses
      if (!/^[0-9+\-*/().\s*]+$/.test(sanitized)) {
        setDisplay('Error');
        return;
      }
      const res = new Function(`'use strict'; return (${sanitized})`)();
      const formatted = typeof res === 'number' && Number.isFinite(res)
        ? String(Math.round(res * 100000000) / 100000000)
        : 'Error';
      setEquation(`${display} = ${formatted}`);
      if (formatted !== 'Error') {
        setHistory((prev) => [ `${display} = ${formatted}`, ...prev.slice(0, 5) ]);
      }
      setDisplay(formatted);
    } catch {
      setDisplay('Error');
    }
  };

  const handleScientific = (func: string) => {
    try {
      const num = parseFloat(display);
      let res = 0;
      if (func === 'sqrt') res = Math.sqrt(num);
      else if (func === 'sin') res = Math.sin((num * Math.PI) / 180);
      else if (func === 'cos') res = Math.cos((num * Math.PI) / 180);
      else if (func === 'tan') res = Math.tan((num * Math.PI) / 180);
      else if (func === 'log') res = Math.log10(num);
      else if (func === 'sq') res = num * num;

      const formatted = String(Math.round(res * 1000000) / 1000000);
      setDisplay(formatted);
    } catch {
      setDisplay('Error');
    }
  };

  const buttons = [
    { label: 'C', onClick: handleClear, color: 'bg-red-950/60 text-red-300 border-red-800' },
    { label: '⌫', onClick: handleDelete, color: 'bg-slate-800 text-slate-200' },
    { label: '(', onClick: () => handleInput('('), color: 'bg-slate-800 text-cyan-300' },
    { label: ')', onClick: () => handleInput(')'), color: 'bg-slate-800 text-cyan-300' },

    { label: 'sin', onClick: () => handleScientific('sin'), color: 'bg-slate-900 text-teal-300' },
    { label: 'cos', onClick: () => handleScientific('cos'), color: 'bg-slate-900 text-teal-300' },
    { label: '√', onClick: () => handleScientific('sqrt'), color: 'bg-slate-900 text-teal-300' },
    { label: '÷', onClick: () => handleInput('/'), color: 'bg-cyan-950 text-cyan-300 border-cyan-800' },

    { label: '7', onClick: () => handleInput('7'), color: 'bg-slate-800 text-slate-100' },
    { label: '8', onClick: () => handleInput('8'), color: 'bg-slate-800 text-slate-100' },
    { label: '9', onClick: () => handleInput('9'), color: 'bg-slate-800 text-slate-100' },
    { label: '×', onClick: () => handleInput('*'), color: 'bg-cyan-950 text-cyan-300 border-cyan-800' },

    { label: '4', onClick: () => handleInput('4'), color: 'bg-slate-800 text-slate-100' },
    { label: '5', onClick: () => handleInput('5'), color: 'bg-slate-800 text-slate-100' },
    { label: '6', onClick: () => handleInput('6'), color: 'bg-slate-800 text-slate-100' },
    { label: '-', onClick: () => handleInput('-'), color: 'bg-cyan-950 text-cyan-300 border-cyan-800' },

    { label: '1', onClick: () => handleInput('1'), color: 'bg-slate-800 text-slate-100' },
    { label: '2', onClick: () => handleInput('2'), color: 'bg-slate-800 text-slate-100' },
    { label: '3', onClick: () => handleInput('3'), color: 'bg-slate-800 text-slate-100' },
    { label: '+', onClick: () => handleInput('+'), color: 'bg-cyan-950 text-cyan-300 border-cyan-800' },

    { label: '0', onClick: () => handleInput('0'), color: 'bg-slate-800 text-slate-100 col-span-2' },
    { label: '.', onClick: () => handleInput('.'), color: 'bg-slate-800 text-slate-100' },
    { label: '=', onClick: handleCalculate, color: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold border-cyan-400' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col glow-cyan-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-cyan-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
              <CalcIcon className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-hud font-bold text-cyan-200 uppercase tracking-wider">
                COMPUTATIONAL CORE [CALC]
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                Scientific Math Unit
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Display Screen */}
        <div className="p-4 bg-slate-950/90 border-b border-slate-800 font-mono text-right">
          <div className="text-xs text-slate-500 min-h-[16px]">
            {equation || 'Ready for calculation'}
          </div>
          <div className="text-3xl font-bold text-cyan-300 overflow-x-auto tracking-wider mt-1">
            {display}
          </div>
        </div>

        {/* Button Grid */}
        <div className="p-4 bg-slate-900 grid grid-cols-4 gap-2 font-mono">
          {buttons.map((btn, i) => (
            <button
              key={i}
              onClick={btn.onClick}
              className={`p-3 rounded-xl text-sm font-medium border border-slate-700/60 hover:brightness-125 active:scale-95 transition-all flex items-center justify-center ${btn.color}`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Mini History */}
        {history.length > 0 && (
          <div className="px-4 py-2 bg-slate-950/70 border-t border-slate-800 text-[11px] font-mono text-slate-400">
            <span className="text-cyan-400 mr-2">Recent:</span>
            {history[0]}
          </div>
        )}
      </div>
    </div>
  );
};
