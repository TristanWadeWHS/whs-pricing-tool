import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { priceJob, JobInputs, VisionAnalysis } from '../../lib/pricing';

export const runtime = 'nodejs';

function fileToBase64(buffer: ArrayBuffer, mime: string) {
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:${mime};base64,${base64}`;
}

function fallbackAnalysis(): VisionAnalysis {
  return {
    estimatedLoadPercent: 50,
    estimatedLoadRange: '40–60% of a 12-yard trailer',
    materialType: 'mixed junk / unknown',
    heavyDebrisRisk: 'medium',
    difficulty: 'medium',
    photoAngleQuality: 'fair',
    confidencePercent: 65,
    hiddenDebrisRisk: 'medium',
    visibleItems: [],
    warnings: ['AI analysis unavailable or incomplete. Manager review recommended.'],
    questionsToAsk: ['Is there anything underneath, behind, or hidden that is not shown in the photos? If yes, price may increase on site.']
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Missing OPENAI_API_KEY in .env.local' }, { status: 500 });
    }

    const form = await req.formData();
    const files = form.getAll('photos') as File[];

    const inputs: JobInputs = {
      distanceTier: String(form.get('distanceTier') || 'under25') as JobInputs['distanceTier'],
      jobType: String(form.get('jobType') || 'mixed junk'),
      carryDistance: String(form.get('carryDistance') || 'short') as JobInputs['carryDistance'],
      stairs: String(form.get('stairs') || 'none') as JobInputs['stairs'],
      workers: Number(form.get('workers') || 1),
      notes: String(form.get('notes') || '')
    };

    if (!files.length) {
      return NextResponse.json({ error: 'Upload at least one photo.' }, { status: 400 });
    }

    const imageParts = [];
    for (const file of files.slice(0, 5)) {
      const buffer = await file.arrayBuffer();
      imageParts.push({ type: 'input_image' as const, image_url: fileToBase64(buffer, file.type || 'image/jpeg') });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `You are analyzing junk removal job photos for Wade Home Services in Orange County, CA.
Return ONLY valid JSON with this exact shape:
{
  "estimatedLoadPercent": number,
  "estimatedLoadRange": string,
  "materialType": string,
  "heavyDebrisRisk": "low" | "medium" | "high",
  "difficulty": "easy" | "medium" | "hard",
  "photoAngleQuality": "poor" | "fair" | "good",
  "confidencePercent": number,
  "hiddenDebrisRisk": "low" | "medium" | "high",
  "visibleItems": string[],
  "warnings": string[],
  "questionsToAsk": string[]
}
Rules:
- Trailer is 12 cubic yards. Full load baseline is $450.
- Be conservative when photos are close-up, wide-angle, blocked, dark, blurry, or may hide extra material.
- If debris could be underneath, behind, covered, stacked, or not fully declared, set hiddenDebrisRisk to medium or high.
- Add this warning when appropriate: "Confirm whether anything is underneath, behind, or hidden. If not declared, price may increase on site."
- Flag concrete, dirt, tile, drywall, appliances, demo debris, cinder blocks, roofing, or very dense materials.
- Estimate confidence from 1 to 100 based on photo clarity, number of angles, and visibility.
- Never guarantee final price from photos alone.`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt + `\nEmployee inputs: ${JSON.stringify(inputs)}` },
            ...imageParts
          ]
        }
      ]
    });

    const text = response.output_text || '';
    let analysis: VisionAnalysis;

    try {
      analysis = JSON.parse(text);
    } catch {
      analysis = fallbackAnalysis();
      analysis.warnings.unshift('Could not parse model JSON. Raw response was not structured correctly.');
    }

    const pricing = priceJob(inputs, analysis);

    return NextResponse.json({ analysis, pricing, inputs });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}