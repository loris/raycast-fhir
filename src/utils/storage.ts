import { LocalStorage } from "@raycast/api";

export interface SavedPackage {
  id: string;
  name: string;
  title: string;
  version: string;
  description: string;
  canonical: string;
  url: string;
  publisher?: string;
  author?: string;
  fhirMajorVersion: number[];
  dateAdded: string;
  order: number;
}

const STORAGE_KEY = "fhir-packages";

export const DEFAULT_PACKAGES: SavedPackage[] = [
  {
    id: "hl7.fhir.r5.core|5.0.0",
    name: "hl7.fhir.r5.core",
    title: "FHIR R5 Core",
    version: "5.0.0",
    description: "FHIR R5 Core specification",
    canonical: "http://hl7.org/fhir",
    url: "http://hl7.org/fhir/R5/",
    publisher: "HL7 International",
    fhirMajorVersion: [5],
    dateAdded: new Date().toISOString(),
    order: 0,
  },
  {
    id: "hl7.fhir.r4b.core|4.3.0",
    name: "hl7.fhir.r4b.core",
    title: "FHIR R4B Core",
    version: "4.3.0",
    description: "FHIR R4B Core specification",
    canonical: "http://hl7.org/fhir",
    url: "http://hl7.org/fhir/R4B/",
    publisher: "HL7 International",
    fhirMajorVersion: [4],
    dateAdded: new Date().toISOString(),
    order: 1,
  },
  {
    id: "hl7.fhir.r4.core|4.0.1",
    name: "hl7.fhir.r4.core",
    title: "FHIR R4 Core",
    version: "4.0.1",
    description: "FHIR R4 Core specification",
    canonical: "http://hl7.org/fhir",
    url: "http://hl7.org/fhir/R4/",
    publisher: "HL7 International",
    fhirMajorVersion: [4],
    dateAdded: new Date().toISOString(),
    order: 2,
  },
];

export async function getSavedPackages(): Promise<SavedPackage[]> {
  const stored = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  try {
    return JSON.parse(stored);
  } catch (error) {
    console.error("Failed to parse saved packages:", error);
    return [];
  }
}

export async function setSavedPackages(packages: SavedPackage[]): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(packages));
}

export async function addPackage(packageData: Omit<SavedPackage, "dateAdded" | "order">): Promise<void> {
  const packages = await getSavedPackages();

  // Check if package already exists
  const existingIndex = packages.findIndex((p) => p.id === packageData.id);
  if (existingIndex !== -1) {
    // Update existing package
    packages[existingIndex] = {
      ...packageData,
      dateAdded: packages[existingIndex].dateAdded,
      order: packages[existingIndex].order,
    };
  } else {
    // Add new package
    const newPackage: SavedPackage = {
      ...packageData,
      dateAdded: new Date().toISOString(),
      order: packages.length,
    };
    packages.push(newPackage);
  }

  await setSavedPackages(packages);
}

export async function removePackage(packageId: string): Promise<void> {
  const packages = await getSavedPackages();
  const filtered = packages.filter((p) => p.id !== packageId);
  await setSavedPackages(filtered);
}

export async function reorderPackages(reorderedPackages: SavedPackage[]): Promise<void> {
  const packagesWithOrder = reorderedPackages.map((pkg, index) => ({
    ...pkg,
    order: index,
  }));
  await setSavedPackages(packagesWithOrder);
}

export async function initializeDefaultPackages(): Promise<void> {
  const existing = await getSavedPackages();
  if (existing.length === 0) {
    await setSavedPackages(DEFAULT_PACKAGES);
  }
}

export async function getPackageById(packageId: string): Promise<SavedPackage | undefined> {
  const packages = await getSavedPackages();
  return packages.find((p) => p.id === packageId);
}
