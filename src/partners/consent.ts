export const PARTNER_CONSENT_VERSION = 'v1.0';

export type PartnerConsentInfo = {
  required: boolean;
  version: string;
  granted: boolean | null;
  memberRef: string | null;
  answeredAt: string | null;
  partner: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

type UserWithSchoolPartner = {
  partnerMemberRef: string | null;
  partnerConsentVersion: string | null;
  partnerConsentAt: Date | null;
  partnerConsentGranted: boolean | null;
  school: {
    partner: {
      id: string;
      name: string;
      slug: string;
      isDefault: boolean;
      status: string;
    } | null;
  } | null;
};

export function buildPartnerConsentInfo(user: UserWithSchoolPartner): PartnerConsentInfo {
  const partner = user.school?.partner;
  const activePartner =
    partner && partner.status === 'active' && !partner.isDefault ? partner : null;

  return {
    required: !!activePartner && user.partnerConsentAt === null,
    version: PARTNER_CONSENT_VERSION,
    granted: user.partnerConsentAt ? user.partnerConsentGranted : null,
    memberRef: user.partnerMemberRef,
    answeredAt: user.partnerConsentAt?.toISOString() ?? null,
    partner: activePartner
      ? { id: activePartner.id, name: activePartner.name, slug: activePartner.slug }
      : null,
  };
}
