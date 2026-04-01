import type { DiscountType, ServiceKey, SiteConfig } from "@/lib/site-config";

interface PricingInput {
  config: SiteConfig;
  serviceKey: ServiceKey;
  durationHours: number;
  headCount: number;
  extraPeople: number;
  discountType: DiscountType;
  withEngineer?: boolean;
  customDiscountRate?: number;
}

export interface PricingBreakdown {
  baseAmount: number;
  extraPeopleAmount: number;
  engineerAmount: number;
  discountAmount: number;
  totalAmount: number;
  totalPeople: number;
}

const formatter = new Intl.NumberFormat("ko-KR");

export function formatCurrency(amount: number): string {
  return `${formatter.format(amount)}원`;
}

export function calculatePrice({
  config,
  serviceKey,
  durationHours,
  headCount,
  extraPeople,
  discountType,
  withEngineer = false,
  customDiscountRate = 0,
}: PricingInput): PricingBreakdown {
  const service = config.services.find((item) => item.key === serviceKey) ?? config.services[0];
  const totalPeople = Math.max(headCount + extraPeople, 1);
  const chargedExtraPeople = Math.max(totalPeople - config.includedPeople, 0);
  const baseAmount = service.hourlyRate * durationHours;
  const extraPeopleAmount = chargedExtraPeople * config.extraPersonFee;
  const engineerAmount =
    withEngineer && (serviceKey === "recording" || serviceKey === "recording_filming")
      ? config.engineerHourlyRate * durationHours
      : 0;
  const subtotal = baseAmount + extraPeopleAmount + engineerAmount;
  let discountAmount = 0;
  if (discountType === "custom") {
    discountAmount = Math.round(subtotal * customDiscountRate);
  } else if (discountType === "saeeden") {
    discountAmount = subtotal;
  } else if (discountType === "dankook") {
    discountAmount = Math.max(0, baseAmount - (50000 * durationHours));
  } else if (discountType === "company") {
    discountAmount = Math.round(subtotal * config.discountRate);
  }

  return {
    baseAmount,
    extraPeopleAmount,
    engineerAmount,
    discountAmount,
    totalAmount: subtotal - discountAmount,
    totalPeople,
  };
}
