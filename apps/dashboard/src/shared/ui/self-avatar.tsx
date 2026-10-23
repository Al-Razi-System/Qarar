"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/utils";

export function SelfAvatar({ name, large = false, source = "/api/account/avatar" }: { name: string; large?: boolean; source?: string }) {
  const [image, setImage] = useState<{url:string;version:number;source:string} | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => { const refresh = () => setVersion(v => v + 1); window.addEventListener("qarar:avatar-updated", refresh); return () => window.removeEventListener("qarar:avatar-updated", refresh); }, []);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | null = null;
    void fetch(source, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok || response.status === 204 || !response.headers.get("content-type")?.startsWith("image/")) return;
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setImage({url:objectUrl,version,source});
    }).catch(() => { /* Decorative fallback remains available during a read failure. */ });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source, version]);
  return <span className={cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-q-border bg-q-surface-2 font-bold text-q-primary", large ? "h-24 w-24 text-q-h2" : "h-11 w-11 text-q-ui")}>
    {image && image.version===version && image.source===source ? <Image unoptimized width={512} height={512} src={image.url} alt={`الصورة الشخصية لـ${name}`} className="h-full w-full object-cover" onError={() => setImage(null)} /> : <span aria-label={`الصورة البديلة لـ${name}`}>{name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join("") || "ق"}</span>}
  </span>;
}
