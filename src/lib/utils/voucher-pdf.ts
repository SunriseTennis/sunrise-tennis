/**
 * Render a parent's form-mode SA Sports Voucher submission to a PDF for record.
 * Branded with a warm sunset header bar; key/value list of the 19 form fields.
 *
 * Use case: when a parent submits via "Fill Out Form", we want a durable
 * artifact (alongside the structured DB row) that can be downloaded later
 * by parent or admin. Image-mode submissions already have the original upload.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface VoucherFormSubmissionData {
  childFirstName: string
  childSurname: string
  childGender: string
  childDob: string
  streetAddress: string
  suburb: string
  postcode: string
  medicareNumber: string | null
  visaNumber: string | null
  parentFirstName: string
  parentSurname: string
  parentContactNumber: string
  parentEmail: string
  firstTime: string                // "Yes" | "No"
  hasDisability: string
  isIndigenous: string
  englishMainLanguage: string
  otherLanguage: string | null
  activityCost: string
  submittedAt: string              // ISO timestamp
  familyName: string | null
}

const SUNSET_ORANGE = rgb(232 / 255, 116 / 255, 80 / 255)
const DARK_BLUE = rgb(43 / 255, 94 / 255, 167 / 255)
const TEXT = rgb(0.15, 0.15, 0.15)
const MUTED = rgb(0.45, 0.45, 0.45)
const LIGHT = rgb(0.92, 0.92, 0.92)

interface Section {
  title: string
  rows: { label: string; value: string }[]
}

function buildSections(d: VoucherFormSubmissionData): Section[] {
  return [
    {
      title: "Child's Information",
      rows: [
        { label: 'First Name', value: d.childFirstName },
        { label: 'Family Name', value: d.childSurname },
        { label: 'Gender', value: d.childGender },
        { label: 'Date of Birth', value: d.childDob },
      ],
    },
    {
      title: 'Identification',
      rows: [
        { label: 'Medicare Number', value: d.medicareNumber ?? '-' },
        { label: 'Australian Visa Number', value: d.visaNumber ?? '-' },
      ],
    },
    {
      title: 'Parent / Guardian',
      rows: [
        { label: 'First Name', value: d.parentFirstName },
        { label: 'Family Name', value: d.parentSurname },
        { label: 'Contact Number', value: d.parentContactNumber },
        { label: 'Email', value: d.parentEmail },
        { label: 'Street Address', value: d.streetAddress },
        { label: 'Suburb', value: d.suburb },
        { label: 'Postcode', value: d.postcode },
      ],
    },
    {
      title: 'Eligibility',
      rows: [
        { label: 'First time joining provider', value: d.firstTime },
        { label: 'Living with a disability', value: d.hasDisability },
        { label: 'Aboriginal / Torres Strait Islander', value: d.isIndigenous },
        { label: 'English main language at home', value: d.englishMainLanguage },
        { label: 'Other language', value: d.otherLanguage ?? '-' },
        { label: 'Cost to participate', value: d.activityCost ? `$${d.activityCost}` : '-' },
      ],
    },
  ]
}

export async function renderFormSubmissionPdf(d: VoucherFormSubmissionData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4
  const { width, height } = page.getSize()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  // Header bar
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: SUNSET_ORANGE })
  page.drawText('Sunrise Tennis', {
    x: 40, y: height - 38, size: 18, font: fontBold, color: rgb(1, 1, 1),
  })
  page.drawText('Sports Voucher — Form Submission', {
    x: 40, y: height - 60, size: 11, font, color: rgb(1, 1, 1),
  })

  // Submission meta
  let y = height - 110
  page.drawText('Submitted', { x: 40, y, size: 9, font, color: MUTED })
  page.drawText(new Date(d.submittedAt).toLocaleString('en-AU'), { x: 110, y, size: 9, font: fontBold, color: TEXT })
  if (d.familyName) {
    page.drawText('Family', { x: 320, y, size: 9, font, color: MUTED })
    page.drawText(d.familyName, { x: 360, y, size: 9, font: fontBold, color: TEXT })
  }
  y -= 18

  // Sections
  const sections = buildSections(d)
  for (const section of sections) {
    y -= 14
    // Section heading underline
    page.drawText(section.title, { x: 40, y, size: 12, font: fontBold, color: DARK_BLUE })
    page.drawLine({
      start: { x: 40, y: y - 4 },
      end: { x: width - 40, y: y - 4 },
      thickness: 0.8,
      color: LIGHT,
    })
    y -= 18

    for (const row of section.rows) {
      if (y < 60) { break } // out of page; cheap layout, single page is enough
      page.drawText(row.label, { x: 40, y, size: 9, font, color: MUTED })
      page.drawText(row.value || '-', { x: 220, y, size: 10, font, color: TEXT })
      y -= 16
    }
  }

  // Footer
  page.drawText('This is a record of the form data the parent submitted via the Sunrise Tennis app.', {
    x: 40, y: 40, size: 8, font, color: MUTED,
  })

  return await doc.save()
}
