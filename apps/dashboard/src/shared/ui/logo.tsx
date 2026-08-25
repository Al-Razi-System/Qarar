import Image from "next/image";
import Link from "next/link";

export function Logo({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  if (inverse) {
    return (
      <Link
        href="/admin/users"
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-white px-3 shadow-sm"
        aria-label="قرار"
      >
        <Image
          src="/brand/qarar-logo-sidebar.png"
          alt="شعار قرار"
          width={190}
          height={78}
          priority
          className="h-9 w-auto object-contain"
        />
      </Link>
    );
  }

  return (
    <Link href="/admin/users" className="inline-flex items-center gap-3">
      <span
        className={`grid h-11 w-11 place-items-center rounded-[14px] text-xl font-black shadow-sm ${
          "bg-gradient-to-br from-[#0066cc] to-[#1e88e5] text-white"
        }`}
      >
        ق
      </span>
      {!compact && (
        <span className="text-[#0a1330]">
          <span className="block text-xl font-black tracking-tight">قــرار</span>
          <span className="block text-[9px] font-bold tracking-[0.38em] opacity-65">
            QARAR
          </span>
        </span>
      )}
    </Link>
  );
}

export function FullLogo() {
  return (
    <Image
      src="/brand/qarar-logo-light.png"
      alt="شعار قرار"
      width={270}
      height={110}
      priority
      className="h-auto w-[210px] mix-blend-multiply"
    />
  );
}
