const logoBase = `${process.env.PUBLIC_URL || ''}/company-logos`;

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
  { id: 'virtusa', alt: 'Virtusa', placed: 7 },
  { id: 'nttdata', alt: 'NTT Data', placed: 19 },
  { id: 'hexaware', alt: 'Hexaware Technologies', placed: 6 },
  { id: 'cybage', alt: 'Cybage', placed: 8 },
  { id: 'kpit', alt: 'KPIT', placed: 17 },
  { id: 'zensar', alt: 'Zensar Technologies', placed: 5 },
  { id: 'mphasis', alt: 'Mphasis', placed: 12 },
  { id: 'cgi', alt: 'CGI', placed: 9 },
  { id: 'ltimindtree', alt: 'LTI Mindtree', placed: 20 },
  { id: 'hitachi', alt: 'Hitachi', placed: 7 },
  { id: 'airtel', alt: 'Airtel', placed: 6 },
  { id: 'hsbc', alt: 'HSBC', placed: 11 },
  { id: 'citiustech', alt: 'Citiustech', placed: 5 },
  { id: 'encora', alt: 'Encora', placed: 13 },
  { id: 'expleo', alt: 'Expleo Solutions', placed: 10 },
  { id: 'dataart', alt: 'DataArt', placed: 8 },
  { id: 'yash', alt: 'Yash Technologies', placed: 14 },
  { id: 'brillio', alt: 'Brillio', placed: 9 },
  { id: 'altimetrik', alt: 'Altimetrik', placed: 16 },
  { id: 'quickheal', alt: 'Quick Heal', placed: 7 },
];

// Show only companies whose logo files are currently available locally.
const AVAILABLE_LOGO_IDS = new Set([
  'tcs',
  'infosys',
  'wipro',
  'cognizant',
  'accenture',
  'deloitte',
  'capgemini',
  'hcl',
  'techmahindra',
  'persistent',
]);

export default MARQUEE_COMPANIES
  .filter((company) => AVAILABLE_LOGO_IDS.has(company.id))
  .map((company) => ({
    ...company,
    logoSrc: `${logoBase}/${company.id}.png`,
  }));

