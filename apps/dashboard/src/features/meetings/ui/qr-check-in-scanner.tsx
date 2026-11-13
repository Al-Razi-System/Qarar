"use client";
import { Dialog } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";

import { ChangeEvent, useEffect, useEffectEvent, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle } from "lucide-react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

export function QrCheckInScanner({ onDetected, onClose }: {
  onDetected: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const processingRef = useRef(false);
  async function handleDetected(value: string) {
    if (processingRef.current) return;
    processingRef.current = true;
    controlsRef.current?.stop();
    setSubmitting(true);
    setSubmissionError(null);
    try {
      await onDetected(value);
    } catch (caught) {
      setSubmissionError(caught instanceof Error ? caught.message : "تعذر تسجيل الحضور. حاول مجدداً.");
      setSubmitting(false);
    }
  }
  const detected = useEffectEvent(handleDetected);

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
            void detected(result.getText());
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
      await handleDetected(result.getText());
    } catch {
      setCameraError("لم يُعثر على رمز QR واضح في الصورة. قرّب الكاميرا وحاول مجدداً.");
    } finally {
      URL.revokeObjectURL(imageUrl);
      setImageBusy(false);
      event.target.value = "";
    }
  }

  return <Dialog title="مسح رمز الحضور" description="وجّه الكاميرا نحو الرمز المعروض في القاعة" size="md" scrollContent onClose={onClose}>

      <div className="p-5">
        <div className="relative aspect-square overflow-hidden rounded-q-control bg-q-header">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-[14%] rounded-q-control border-2 border-q-border/80 " />
          {cameraError && <div className="absolute inset-0 grid place-items-center bg-q-header p-8 text-center"><div><Camera className="mx-auto text-q-link" size={34} /><p className="mt-4 text-q-caption font-bold leading-6 text-q-on-primary">{cameraError}</p></div></div>}
          {submitting && <div className="absolute inset-0 grid place-items-center bg-q-scrim p-8 text-center"><div><LoaderCircle className="mx-auto animate-spin text-q-link" size={38} /><p className="mt-4 text-q-caption font-bold text-q-on-primary">تم التقاط الرمز، جارٍ تسجيل حضورك…</p><p className="mt-2 text-q-caption text-q-text-2">لا تغلق النافذة حتى يكتمل التحقق.</p></div></div>}
        </div>
        {submissionError && <div role="alert" className="mt-4 rounded-q-control border border-q-danger bg-q-danger-soft p-3 text-q-caption font-bold leading-5 text-q-danger"><p>{submissionError}</p><Button variant="secondary" type="button" onClick={() => { processingRef.current = false; setSubmissionError(null); setCameraError("أغلق النافذة وافتح الماسح مجدداً، أو التقط صورة جديدة للرمز."); }} className="mt-2 rounded-q-control border px-3 py-2 font-bold">المحاولة بصورة أخرى</Button></div>}
        <label className="mt-4 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-q-control border border-q-primary bg-q-surface-2 text-q-caption font-bold text-q-link hover:bg-q-surface-2">
          {imageBusy ? <LoaderCircle className="animate-spin" size={17} /> : <ImagePlus size={17} />}
          التقاط صورة للرمز
          <input type="file" accept="image/*" capture="environment" onChange={readImage} disabled={imageBusy || submitting} className="sr-only" />
        </label>
      </div>
  </Dialog>;
}
