// The starter template library: ready-made designs users can start from.
//
// Every starter is a function of the workspace's BrandTheme, so the whole
// gallery automatically uses the brand's colours, font, logo, company name,
// address and social links. To add a starter: write it in one of the
// category files and list it in ALL_STARTERS below.
//
// Safe to import from server AND client.
import { withFreshIds, type BrandTheme, type EmailDocument } from "@/lib/templates/document";
import { STARTER_CATEGORIES, type StarterCategory, type StarterDefinition, type StarterMeta } from "./helpers";
import { companyUpdate, productLaunch } from "./announcements";
import { abandonedCart, newArrivals, orderThankYou } from "./ecommerce";
import { eventInvitation, webinarReminder } from "./events";
import { reviewRequest, surveyRequest } from "./feedback";
import { blogDigest, monthlyNewsletter } from "./newsletter";
import { minimalLogo, plainLetter } from "./plain";
import { flashSale, memberOffer } from "./promotions";
import { stillInterested, weMissYou } from "./re-engagement";
import { birthdayWish, festivalOffer, holidayGreeting } from "./seasonal";
import { onboardingTips, welcome } from "./welcome";

export { STARTER_CATEGORIES, type StarterCategory, type StarterMeta };

/** Gallery order: grouped by category, most useful first inside each group. */
const ALL_STARTERS: StarterDefinition[] = [
  welcome,
  onboardingTips,
  monthlyNewsletter,
  blogDigest,
  flashSale,
  memberOffer,
  eventInvitation,
  webinarReminder,
  abandonedCart,
  orderThankYou,
  newArrivals,
  productLaunch,
  companyUpdate,
  weMissYou,
  stillInterested,
  holidayGreeting,
  festivalOffer,
  birthdayWish,
  surveyRequest,
  reviewRequest,
  plainLetter,
  minimalLogo,
];

const BY_ID = new Map(ALL_STARTERS.map((s) => [s.id, s]));

const toMeta = (s: StarterDefinition): StarterMeta => ({
  id: s.id,
  name: s.name,
  category: s.category,
  description: s.description,
  subject: s.subject,
  preheader: s.preheader,
});

/** Metadata only (no documents), for the gallery and for picking by id. */
export const STARTERS: StarterMeta[] = ALL_STARTERS.map(toMeta);

export function getStarterMeta(id: string): StarterMeta | null {
  const starter = BY_ID.get(id);
  return starter ? toMeta(starter) : null;
}

/** Builds a starter's document in the given brand. Returns null for an unknown id. */
export function buildStarter(id: string, theme: BrandTheme): EmailDocument | null {
  const starter = BY_ID.get(id);
  if (!starter) return null;
  // Fresh ids every time, so two templates made from the same starter never share ids.
  return withFreshIds(starter.build(theme));
}
