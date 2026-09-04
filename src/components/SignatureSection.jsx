import React, { useRef, useEffect } from 'react';
import { PenTool, RotateCcw, Check, User, Calendar, ShieldCheck } from 'lucide-react';

function CanvasSignaturePad({ value, onSave, label }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Set high DPR for crisp lines
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // If there's an existing signature dataUrl, draw it
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = value;
    }
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    isDrawing.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    onSave('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-sky-600" />
          {label}
        </label>
        <button
          type="button"
          onClick={clearCanvas}
          className="text-[12px] font-semibold text-slate-500 hover:text-rose-600 flex items-center space-x-1 py-1 px-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Clear Signature</span>
        </button>
      </div>

      <div className="relative border-2 border-dashed border-slate-300 rounded-2xl bg-white overflow-hidden shadow-inner">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-36 touch-none cursor-crosshair block"
        />
        {!value && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 text-xs font-medium">
            Sign here with finger or stylus
          </div>
        )}
      </div>
    </div>
  );
}

export default function SignatureSection({ signatures, onChange, facility, onOpenReport }) {
  const safeSignatures = signatures || {};
  const safeFacility = facility || {};

  const updateSurveyor = (field, val) => {
    onChange({
      ...safeSignatures,
      surveyor: { ...(safeSignatures.surveyor || {}), [field]: val }
    });
  };

  const updateClient = (field, val) => {
    onChange({
      ...safeSignatures,
      client: { ...(safeSignatures.client || {}), [field]: val }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-sky-950 rounded-2xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex items-start space-x-3">
          <div className="p-3 bg-white/10 rounded-xl">
            <ShieldCheck className="w-7 h-7 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Audit Sign-Off & Verification</h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Capture mobile touchscreen signatures from the Lead Surveyor and Client / Facility Manager to authenticate the assessment report.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Surveyor Sign-off */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-sky-600" />
              Lead Surveyor Sign-Off
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Certifies that inspection observations and ratings are true and accurate.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Surveyor Full Name & Credentials
            </label>
            <input
              type="text"
              placeholder="e.g. David H. Miller (MRICS)"
              value={signatures.surveyor?.name || facility.surveyorName || ''}
              onChange={(e) => updateSurveyor('name', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sign-Off Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={signatures.surveyor?.date || facility.surveyDate || ''}
                onChange={(e) => updateSurveyor('date', e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <CanvasSignaturePad
            label="Digital Touch Signature"
            value={signatures.surveyor?.signatureData || ''}
            onSave={(val) => updateSurveyor('signatureData', val)}
          />
        </div>

        {/* Client Sign-off */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-sky-600" />
              Client / Facility Manager Receipt
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Acknowledges receipt and review of the building condition findings.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Client / Manager Full Name
            </label>
            <input
              type="text"
              placeholder="e.g. Eng. Tariq Al-Mansoor"
              value={signatures.client?.name || facility.facilityManager || facility.clientName || ''}
              onChange={(e) => updateClient('name', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Receipt Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={signatures.client?.date || facility.surveyDate || ''}
                onChange={(e) => updateClient('date', e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <CanvasSignaturePad
            label="Digital Touch Signature"
            value={signatures.client?.signatureData || ''}
            onSave={(val) => updateClient('signatureData', val)}
          />
        </div>
      </div>

      {/* Generate Report Button */}
      <div className="pt-2 flex justify-center sm:justify-end">
        <button
          onClick={onOpenReport}
          className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-98 text-white font-bold text-sm shadow-xl shadow-sky-600/30 transition-all flex items-center justify-center space-x-2"
        >
          <span>View Audit Report & Download PDF</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
