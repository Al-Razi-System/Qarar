import Image from "next/image";
import Link from "next/link";

/** The product mark in the navigation rail. */
export function Logo() {
  return (
    <Link href="/admin" aria-label="قرار، الصفحة الرئيسية" className="inline-flex min-h-11 items-center gap-3">
      <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-q-control bg-q-primary text-q-h3 font-bold text-q-on-primary">
        ق
      </span>
      <span className="text-q-h3 font-bold text-q-text">قرار</span>
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
