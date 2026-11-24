const logoBase = `${process.env.PUBLIC_URL || ''}/company-logos`;

// Each id has a matching public/company-logos/<id>.png, unless `logo: false`.
const MARQUEE_COMPANIES = [
  { id: 'tcs', alt: 'TCS', placed: 18 },
  { id: 'infosys', alt: 'Infosys', placed: 14 },
  { id: 'wipro', alt: 'Wipro', placed: 12 },
  { id: 'cognizant', alt: 'Cognizant', placed: 16 },
  { id: 'accenture', alt: 'Accenture', placed: 15 },
  { id: 'deloitte', alt: 'Deloitte', placed: 11 },
  { id: 'capgemini', alt: 'Capgemini', placed: 13 },
  { id: 'hcl', alt: 'HCL Technologies', placed: 10 },
  { id: 'techmahindra', alt: 'Tech Mahindra', placed: 9 },
  { id: 'persistent', alt: 'Persistent Systems', placed: 8 },
  { id: 'ltimindtree', alt: 'LTI Mindtree', placed: 20 },
  { id: 'yash', alt: 'Yash Technologies', placed: 14 },
  { id: 'bitwise', alt: 'Bitwise', placed: 9 },
  { id: 'ibm', alt: 'IBM', placed: 21 },
  { id: 'bmc', alt: 'BMC', placed: 11 },
  { id: 'genpact', alt: 'Genpact', placed: 12 },
  { id: 'quickheal', alt: 'Quick Heal', placed: 7 },
];

export default MARQUEE_COMPANIES.map((company) => ({
  ...company,
  logoSrc: company.logo === false ? null : `${logoBase}/${company.id}.png`, // logo: false = name badge, no image request
}));
