import { prisma } from '../db.js';

export type BrandingResponse = {
  partnerName: string | null;
  logoUrl: string | null;
  logoAlt: string | null;
  updatedAt: string;
  partnerSlug: string;
};

function formatPartner(partner: {
  slug: string;
  name: string;
  logoUrl: string | null;
  logoAlt: string | null;
  updatedAt: Date;
}): BrandingResponse {
  return {
    partnerSlug: partner.slug,
    partnerName: partner.name,
    logoUrl: partner.logoUrl,
    logoAlt: partner.logoAlt,
    updatedAt: partner.updatedAt.toISOString(),
  };
}

export async function getDefaultPartner() {
  const partner = await prisma.partner.findFirst({
    where: { isDefault: true, status: 'active' },
  });

  if (partner) return partner;

  return prisma.partner.findFirst({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
}

export async function resolvePartnerForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      school: {
        select: {
          partner: true,
        },
      },
    },
  });

  const schoolPartner = user?.school?.partner;
  if (schoolPartner && schoolPartner.status === 'active') {
    return schoolPartner;
  }

  return getDefaultPartner();
}

export async function getBrandingForUser(userId?: string): Promise<BrandingResponse | null> {
  const partner = userId ? await resolvePartnerForUser(userId) : await getDefaultPartner();
  if (!partner) return null;
  return formatPartner(partner);
}

export { formatPartner };
