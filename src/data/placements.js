// Real placements (candidates.selectedCompany / selectedPackage), shown one at a time under the login card.
// Only 10 LPA and above; names as first name + surname initial. Update by hand when new candidates are placed.
const PLACEMENTS = [
  { name: 'Rahul I.', tech: 'Python', exp: '7 yrs exp', company: 'Prescient Security', lpa: 19.5 },
  { name: 'Hemant J.', tech: 'Business Analyst', exp: '', company: 'Net2Source', lpa: 18.5 },
  { name: 'Rohit S.', tech: 'Python', exp: '5.4 yrs exp', company: 'Comcast', lpa: 18 },
  { name: 'Madhav K.', tech: '.Net Developer', exp: 'Fresher', company: 'DataArt', lpa: 16 },
  { name: 'Poonam P.', tech: 'Python', exp: '5.1 yrs exp', company: 'Team Greek Solutions', lpa: 14 },
  { name: 'Priti M.', tech: 'PHP · Python · Java', exp: '', company: 'NiCE', lpa: 13.5 },
  { name: 'Poonam M.', tech: 'Python', exp: '5.3 yrs exp', company: 'ITC Infotech', lpa: 13 },
  { name: 'Shubham G.', tech: '.Net Developer', exp: '', company: 'MindCraft Software', lpa: 11 },
  { name: 'Pallavi W.', tech: 'Automation Testing · Manual Testing', exp: '', company: 'Bitwise', lpa: 11 },
  { name: 'Poonam D.', tech: 'MERN Stack · Python · React Developer', exp: '5.1 yrs exp', company: 'Zephyr Financial Publisher', lpa: 11 },
  { name: 'Vivek N.', tech: 'Python · PHP', exp: '', company: 'Emergys Solutions', lpa: 11 },
  { name: 'Komal B.', tech: 'Python', exp: '4.6 yrs exp', company: 'Dextrix', lpa: 10.5 },
];

export const randomPlacement = () => PLACEMENTS[Math.floor(Math.random() * PLACEMENTS.length)];
