export { addPurchasedCredits, initializeCredits } from "./lib/credit-init";
export {
	buildIRadiusMobile,
	buildPhonesFromSync,
	type CustomerPhone,
	getPrimaryPhone,
	MAX_PHONES,
	normalizeLebanesePhone,
	parsePhones,
	splitPhoneString,
} from "./lib/phones";
export * from "./prisma";
