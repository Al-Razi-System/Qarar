"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { initialOf } from "./member-seat";

export type MemberCardDetails = {
  name: string;
  photoUrl?: string;
  /** The council role, e.g. «رئيس المجلس» or «عضو». */
  roleLabel?: string | null;
  /** The membership's own title, e.g. «ممثل القسم». */
  membershipTitle?: string | null;
  jobTitle?: string | null;
  employer?: string | null;
  email?: string | null;
  /** Present only when the server returned it to this viewer. */
  mobile?: string | null;
  attendanceLabel?: string | null;
  memberSince?: string | null;
};

type Props = {
  /** Null while the cards are loading or when they could not be loaded. */
  member: MemberCardDetails | null;
  /** The seat's name, shown while the card itself is unavailable. */
  fallbackName: string;
  /** Why the card could not be shown, written for the viewer. */
  unavailable?: string | null;
  /** The cards are still on their way. */
  loading?: boolean;
  /** Whether this viewer may see mobile numbers at all; explains the missing number otherwise. */
  mobileVisible: boolean;
  onClose: () => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-q-border py-2.5 last:border-b-0">
      <dt className="text-q-caption text-q-text-2">{label}</dt>
      <dd className="m-0 text-q-ui font-bold text-q-text">{children}</dd>
    </div>
  );
}

/**
 * A council member's card, opened from their seat at the table. What it shows
 * is what the server returned to this viewer: the mobile number is absent for
 * anyone but the council's chair and rapporteur.
 */
export function MemberCard({ member, fallbackName, unavailable, loading = false, mobileVisible, onClose }: Props) {
  const name = member?.name ?? fallbackName;
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = member?.photoUrl && failedPhoto !== member.photoUrl ? member.photoUrl : null;
  return (
    <Dialog title={`بطاقة ${name}`} scrollContent onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>إغلاق</Button>}>
      <div className="flex items-center gap-4 rounded-q-card border border-q-border bg-q-surface-2 p-4">
        <div aria-hidden={photo ? undefined : true} className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-q-border-strong bg-q-seat text-q-h2 font-bold text-q-text">
          {photo
            ? <Image unoptimized src={photo} alt={`صورة ${name}`} width={80} height={80} onError={() => setFailedPhoto(photo)} className="h-full w-full object-cover" />
            : initialOf(name)}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 text-q-h3 font-bold">{name}</p>
          {member?.roleLabel && (
            <p className="m-0 text-q-ui font-bold text-q-link">
              {member.roleLabel}{member.membershipTitle && member.membershipTitle.trim() !== member.roleLabel.trim() ? ` · ${member.membershipTitle}` : ""}
            </p>
          )}
          {member?.jobTitle && <p className="m-0 text-q-ui text-q-text-2">{member.jobTitle}</p>}
        </div>
      </div>
      {loading && !member && <p role="status" className="m-0 mt-4 text-q-ui text-q-text-2">جارٍ تحميل بطاقة العضو…</p>}
      {unavailable && <p role="alert" className="m-0 mt-4 rounded-q-control bg-q-warning-soft p-3 text-q-ui font-bold text-q-warning">{unavailable}</p>}
      {member && (
        <dl className="m-0 break-words">
          {member.employer && <Row label="جهة العمل">{member.employer}</Row>}
          {member.email && <Row label="البريد الإلكتروني"><a dir="ltr" href={`mailto:${member.email}`} className="inline-block max-w-full break-all text-q-link underline-offset-4 hover:underline">{member.email}</a></Row>}
          {member.mobile
            ? <Row label="الجوال"><a dir="ltr" href={`tel:${member.mobile}`} className="text-q-link underline-offset-4 hover:underline">{member.mobile}</a></Row>
            : !mobileVisible && <Row label="الجوال"><span className="font-normal text-q-text-2">يظهر لرئيس المجلس ومقرره فقط.</span></Row>}
          {member.attendanceLabel && <Row label="الحضور في هذه الجلسة">{member.attendanceLabel}</Row>}
          {member.memberSince && <Row label="عضو في المجلس منذ">{member.memberSince}</Row>}
        </dl>
      )}
    </Dialog>
  );
}
