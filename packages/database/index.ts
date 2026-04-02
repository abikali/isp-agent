export { addPurchasedCredits, initializeCredits } from "./lib/credit-init";
export {
	buildPhonesFromSync,
	type CustomerPhone,
	getPrimaryPhone,
	MAX_PHONES,
	normalizeLebanesePhone,
	parsePhones,
	splitPhoneString,
} from "./lib/phones";
export * from "./prisma";
