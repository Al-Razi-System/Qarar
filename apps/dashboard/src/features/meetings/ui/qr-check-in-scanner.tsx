"use client";

import { ChangeEvent, useEffect, useEffectEvent, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, ScanLine, X } from "lucide-react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

export function QrCheckInScanner({ onDetected, onClose }: {
  onDetected: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const detected = useEffectEvent((value: string) => onDetected(value));

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserQRCodeReader();

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError("البث المباشر للكاميرا يحتاج HTTPS. استخدم زر التقاط صورة أدناه.");
        return;
      }
      try {
        controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
          if (!cancelled && result) {
            controlsRef.current?.stop();
            detected(result.getText());
          }
        });
      } catch {
        if (!cancelled) setCameraError("تعذر فتح الكاميرا. اسمح بالوصول أو استخدم التقاط صورة.");
      }
    }

    void start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, []);

  async function readImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageBusy(true);
    setCameraError(null);
    const imageUrl = URL.createObjectURL(file);
    try {
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(imageUrl);
      onDetected(result.getText());
    } catch {
      setCameraError("لم يُعثر على رمز QR واضح في الصورة. قرّب الكاميرا وحاول مجدداً.");
    } finally {
      URL.revokeObjectURL(imageUrl);
      setImageBusy(false);
      event.target.value = "";
    }
  }

  return <div className="fixed inset-0 z-[120] grid place-items-center bg-[#06182d]/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="مسح رمز الحضور">
    <section className="w-full max-w-lg overflow-hidden rounded-[1.8rem] border border-white/15 bg-white shadow-2xl">
      <header className="flex items-center justify-between bg-gradient-to-l from-[#087ee5] to-[#0a315f] px-5 py-4 text-white">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><ScanLine size={21} /></span><div><h2 className="text-sm font-black">مسح رمز الحضور</h2><p className="mt-0.5 text-[10px] text-blue-100">وجّه الكاميرا نحو الرمز المعروض في القاعة</p></div></div>
        <button onClick={onClose} title="إغلاق الماسح" aria-label="إغلاق الماسح" className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 hover:bg-white/20"><X size={18} /></button>
      </header>
      <div className="p-5">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#07192d]">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(2,15,30,.35)]" />
          {cameraError && <div className="absolute inset-0 grid place-items-center bg-[#07192d] p-8 text-center"><div><Camera className="mx-auto text-[#61b7ff]" size={34} /><p className="mt-4 text-xs font-bold leading-6 text-white">{cameraError}</p></div></div>}
        </div>
        <label className="mt-4 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#b9d8f4] bg-[#eef7ff] text-xs font-black text-[#086fc8] hover:bg-[#e1f1ff]">
          {imageBusy ? <LoaderCircle className="animate-spin" size={17} /> : <ImagePlus size={17} />}
          التقاط صورة للرمز
          <input type="file" accept="image/*" capture="environment" onChange={readImage} disabled={imageBusy} className="sr-only" />
        </label>
      </div>
    </section>
  </div>;
}
