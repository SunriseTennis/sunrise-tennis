/**
 * Extract sports voucher form data from an image/PDF using Google Gemini Flash.
 * Returns structured JSON matching the SA Sports Vouchers Plus CSV columns.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

const EXTRACTION_PROMPT = `You are extracting data from a South Australia Sports Vouchers Plus form.
Extract ALL of the following fields from the image. Return ONLY valid JSON with these exact keys:

{
  "child_first_name": "string",
  "child_surname": "string",
  "child_gender": "Male or Female or Gender Diverse",
  "child_dob": "DD/MM/YYYY",
  "street_address": "string",
  "suburb": "string",
  "postcode": "4 digits",
  "visa_number": "string or empty",
  "medicare_number": "11 digits (10-digit card number concatenated with 1-digit reference number)",
  "parent_first_name": "string",
  "parent_surname": "string",
  "parent_contact_number": "string",
  "parent_email": "string",
  "first_time": "Yes or No",
  "has_disability": "Yes or No",
  "is_indigenous": "Yes or No",
  "english_main_language": "Yes or No",
  "other_language": "string or empty",
  "activity_cost": "number as string, no dollar sign (e.g. 260)"
}

Important:
- For Medicare number: concatenate the 10-digit card number with the 1-digit reference number to get 11 digits total.
- For checkboxes, determine if Yes or No is ticked/checked.
- If a field is empty or illegible, use an empty string.
- Return ONLY the JSON object, no markdown, no explanation.`

interface ExtractedVoucherData {
  child_first_name: string
  child_surname: string
  child_gender: string
  child_dob: string
  street_address: string
  suburb: string
  postcode: string
  visa_number: string
  medicare_number: string
  parent_first_name: string
  parent_surname: string
  parent_contact_number: string
  parent_email: string
  first_time: string
  has_disability: string
  is_indigenous: string
  english_main_language: string
  other_language: string
  activity_cost: string
}

export async function extractVoucherFromImage(
  imageBase64: string,
  mimeType: string,
): Promise<{ data: ExtractedVoucherData } | { error: string }> {
  if (!GEMINI_API_KEY) {
    return { error: 'Gemini API key not configured' }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: EXTRACTION_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBase64,
                },
              },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        }),
      },
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini API error:', err)
      return { error: 'AI extraction failed. Please try again.' }
    }

    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      return { error: 'No response from AI' }
    }

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const data = JSON.parse(jsonStr) as ExtractedVoucherData

    return { data }
  } catch (err) {
    console.error('Voucher extraction failed:', err)
    return { error: 'Failed to extract voucher data' }
  }
}
