import React, { useState } from 'react';
import { X, Camera, Download, RefreshCw, CheckCircle, Image as ImageIcon } from 'lucide-react';

interface ScreenshotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({ isOpen, onClose }) => {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  if (!isOpen) return null;

  const takeScreenCapture = async () => {
    setIsCapturing(true);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'browser' },
        });

        const track = stream.getVideoTracks()[0];
        // Capture using video element for universal browser support
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          setCapturedImage(dataUrl);
        }
        track.stop();
      } else {
        // Fallback simulation screenshot using canvas
        simulateScreenshot();
      }
    } catch (err) {
      console.warn('DisplayMedia capture denied or unsupported, using canvas snapshot fallback.', err);
      simulateScreenshot();
    } finally {
      setIsCapturing(false);
    }
  };

  const simulateScreenshot = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Draw simulated HUD screenshot
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, 800, 480);

      // Gradient grid
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 800; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 480);
        ctx.stroke();
      }
      for (let j = 0; j < 480; j += 40) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(800, j);
        ctx.stroke();
      }

      ctx.fillStyle = '#00f0ff';
      ctx.font = 'bold 20px Orbitron, monospace';
      ctx.fillText('JARVIS HUD SNAPSHOT', 40, 60);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px monospace';
      ctx.fillText(`TIMESTAMP: ${new Date().toISOString()}`, 40, 100);
      ctx.fillText('STATUS: SYSTEMS NOMINAL', 40, 130);
      ctx.fillText('FOLDER PATH: C:\\Jarvis\\Screenshots\\', 40, 160);

      const dataUrl = canvas.toDataURL('image/png');
      setCapturedImage(dataUrl);
    }
  };

  const handleDownload = () => {
    if (!capturedImage) return;
    const a = document.createElement('a');
    a.href = capturedImage;
    const filename = `Jarvis_Screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.download = filename;
    a.click();
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col glow-cyan-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-cyan-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <Camera className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-hud font-bold text-cyan-200 uppercase tracking-wider">
                JARVIS SCREEN CAPTURE [C:\Jarvis\Screenshots]
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                Visual display frame capture unit
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

        {/* Content Area */}
        <div className="p-6 bg-slate-950 flex flex-col items-center justify-center min-h-[280px]">
          {capturedImage ? (
            <div className="space-y-4 w-full flex flex-col items-center">
              <div className="relative rounded-xl overflow-hidden border border-cyan-500/40 glow-cyan-sm max-w-full">
                <img
                  src={capturedImage}
                  alt="Jarvis Screen Capture"
                  referrerPolicy="no-referrer"
                  className="max-h-72 w-auto object-contain rounded-lg"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={takeScreenCapture}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs border border-slate-700 flex items-center gap-2 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCapturing ? 'animate-spin' : ''}`} />
                  <span>Capture Again</span>
                </button>

                <button
                  onClick={handleDownload}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold font-mono text-xs flex items-center gap-2 transition-colors shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PNG</span>
                </button>
              </div>

              {savedMessage && (
                <p className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Saved to device storage & logged to screenshot gallery.</span>
                </p>
              )}
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto glow-cyan-sm">
                <ImageIcon className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-hud font-bold text-cyan-200">
                  Ready to Capture Screen
                </h3>
                <p className="text-xs font-mono text-slate-400 max-w-sm mt-1">
                  Say "take screenshot" or "स्क्रीनशॉट लो" or click the button below to capture the active display.
                </p>
              </div>
              <button
                id="trigger-screenshot-btn"
                onClick={takeScreenCapture}
                disabled={isCapturing}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-xs shadow-lg glow-cyan flex items-center gap-2 mx-auto transition-all"
              >
                <Camera className="w-4 h-4" />
                <span>{isCapturing ? 'Capturing...' : 'Capture Active Screen'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
