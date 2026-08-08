// Grille tarifaire officielle du Mercer & Stellaria Corporation.
// Ces prestations sont proposées par défaut dans les devis et factures.
// Le prix reste modifiable ligne par ligne par l'avocat.

export type LegalService = {
  label: string;
  price: number;
  note?: string;
};

export const LEGAL_SERVICES: LegalService[] = [
  { label: "Représentation juridique /30mn", price: 400 },
  { label: "Représentation juridique lors d'un procès /30mn", price: 1000 },
  { label: "Travail préparatoire à un dossier /30mn", price: 500 },
  { label: "Consultation juridique /30mn", price: 300 },
  { label: "Rédaction d'acte juridique", price: 400 },
  { label: "Contrat simple", price: 400 },
  { label: "Contrat complexe", price: 600 },
  { label: "Analyse juridique de dossier /30mn", price: 500 },
  { label: "Assistance en médiation /30mn", price: 800 },
  { label: "Assistance négociation /30mn", price: 800 },
  { label: "Assistance lors d'une garde à vue /30mn", price: 300 },
  { label: "Dépôt d'une plainte", price: 500 },
  { label: "Dépôt d'un recour en appel", price: 700 },
  { label: "Constitution d'un dossier complet", price: 1000 },
  { label: "Rendez-vous client /30mn", price: 400 },
  { label: "Rendez-vous partie adverse /30mn", price: 600 },
  { label: "Comparution devant un juge", price: 1000 },
  { label: "Vérification d'un document", price: 400 },
  { label: "Obtention de pièces administratives", price: 500 },
];
