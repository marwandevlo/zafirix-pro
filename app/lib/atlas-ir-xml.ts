import type { Etat9421Data } from '@/app/types/atlas-ir-export';
import { validateEtat9421ForExport } from '@/app/lib/atlas-ir-server';
import {
  escapeDgiXml,
  formatDgiAmount,
  formatDgiIce,
  formatDgiIdentifiantFiscal,
} from '@/app/lib/atlas-tva-dgi';

/**
 * Generate DGI SIMPL-IR État 9421 XML (Annuel des traitements et salaires).
 */
export function generateEtat9421Xml(data: Etat9421Data): string {
  const validation = validateEtat9421ForExport(data);
  if (!validation.ok) {
    throw new Error(validation.error ?? 'export_invalid');
  }

  const ifFormatted = formatDgiIdentifiantFiscal(data.identifiantFiscal);
  const iceFormatted = data.ice ? formatDgiIce(data.ice) : '';
  const raisonSociale = escapeDgiXml(data.raisonSociale);

  const salaryLines = data.employees.map((e) => [
    '    <Salarie>',
    `      <identifiantEmploye>${escapeDgiXml(e.employeeId)}</identifiantEmploye>`,
    `      <nom>${escapeDgiXml(e.nom)}</nom>`,
    ...(e.cin ? [`      <cin>${escapeDgiXml(e.cin)}</cin>`] : []),
    ...(e.cnssMatricule ? [`      <matriculeCnss>${escapeDgiXml(e.cnssMatricule)}</matriculeCnss>`] : []),
    `      <moisPayes>${e.moisPayes}</moisPayes>`,
    `      <salaireBrutAnnuel>${formatDgiAmount(e.salaireBrutAnnuel)}</salaireBrutAnnuel>`,
    `      <cnssSalarial>${formatDgiAmount(e.cnssSalarialAnnuel)}</cnssSalarial>`,
    `      <amoSalarial>${formatDgiAmount(e.amoSalarialAnnuel)}</amoSalarial>`,
    `      <irRetenu>${formatDgiAmount(e.irAnnuel)}</irRetenu>`,
    `      <salaireNetAnnuel>${formatDgiAmount(e.salaireNetAnnuel)}</salaireNetAnnuel>`,
    `      <cnssPatronal>${formatDgiAmount(e.cnssPatronalAnnuel)}</cnssPatronal>`,
    `      <amoPatronal>${formatDgiAmount(e.amoPatronalAnnuel)}</amoPatronal>`,
    '    </Salarie>',
  ].join('\n'));

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Etat9421 xmlns="http://www.tax.gov.ma/ir/v1">',
    '  <Entete>',
    `    <identifiantFiscal>${ifFormatted}</identifiantFiscal>`,
    ...(iceFormatted ? [`    <ice>${iceFormatted}</ice>`] : []),
    ...(raisonSociale ? [`    <raisonSociale>${raisonSociale}</raisonSociale>`] : []),
    ...(data.cnssEmployeur ? [`    <cnssEmployeur>${escapeDgiXml(data.cnssEmployeur)}</cnssEmployeur>`] : []),
    `    <exercice>${data.fiscalYear}</exercice>`,
    `    <periodeDu>${data.periodeDu}</periodeDu>`,
    `    <periodeAu>${data.periodeAu}</periodeAu>`,
    `    <nombreEmployes>${data.totals.nombreEmployes}</nombreEmployes>`,
    `    <moisCouverts>${data.totals.moisCouverts}</moisCouverts>`,
    '  </Entete>',
    '  <Salaries>',
    salaryLines.join('\n'),
    '  </Salaries>',
    '  <Totaux>',
    `    <totalBrutAnnuel>${formatDgiAmount(data.totals.totalBrut)}</totalBrutAnnuel>`,
    `    <totalCnssSalarial>${formatDgiAmount(data.totals.totalCnssSalarial)}</totalCnssSalarial>`,
    `    <totalAmoSalarial>${formatDgiAmount(data.totals.totalAmoSalarial)}</totalAmoSalarial>`,
    `    <totalIrRetenu>${formatDgiAmount(data.totals.totalIr)}</totalIrRetenu>`,
    `    <totalNetAnnuel>${formatDgiAmount(data.totals.totalNet)}</totalNetAnnuel>`,
    `    <totalCnssPatronal>${formatDgiAmount(data.totals.totalCnssPatronal)}</totalCnssPatronal>`,
    `    <totalAmoPatronal>${formatDgiAmount(data.totals.totalAmoPatronal)}</totalAmoPatronal>`,
    '  </Totaux>',
    '  <meta>',
    `    <formulaVersion>${escapeDgiXml(data.formulaVersion)}</formulaVersion>`,
    `    <dateGeneration>${new Date().toISOString().slice(0, 10)}</dateGeneration>`,
    '  </meta>',
    '</Etat9421>',
  ];

  return lines.join('\n');
}

export function etat9421XmlFilename(fiscalYear: number): string {
  return `Etat9421_${fiscalYear}_DGI.xml`;
}
