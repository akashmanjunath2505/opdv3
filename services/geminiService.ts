
import { GoogleGenAI, Type } from "@google/genai";
import {
  Message,
  DoctorProfile,
  PreCodedGpt,
  PromptInsight,
  ClinicalProtocol,
  UserRole,
} from '../types';
import { runNexusWorkflow } from '../engine/workflow';
import { prescriptionDictionary } from '../prescription_dictionary';
import { CLINICAL_PROTOCOLS } from '../knowledgeBase';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SUPPORTED_LANGUAGES = ["English", "Hindi", "Marathi", "Gujarati", "Tamil", "Bengali"];

// FIX: Updated model name to latest version according to guidelines
export const processAudioSegment = async (
  base64Audio: string,
  mimeType: string,
  language: string,
  doctorProfile: DoctorProfile,
  previousContext: string = ""
): Promise<{ speaker: 'Doctor' | 'Patient'; text: string }[] | null> => {
  const systemInstruction = `
    You are an expert Medical Scribe. 
    TASK: Transcribe this clinical audio segment verbatim.
    DIARIZATION: Identify "Doctor" and "Patient". 
    CONTEXT: Use previous dialogue for speaker consistency: "${previousContext}"
    
    CRITICAL LANGUAGE RULE: You MUST output the transcript strictly in the native script of ${language}. 
    Example: If ${language} is Hindi, use Devanagari (e.g., नमस्ते). Do NOT use Romanized script (Hinglish).
    
    RULES: 
    1. Return ONLY valid JSON array of objects.
    2. Do NOT use markdown formatting.
  `;

  try {
    const audioPart = {
      inlineData: { data: base64Audio, mimeType },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [audioPart, { text: `Transcribe strictly in the native script of ${language}.` }] },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0,
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              speaker: { type: Type.STRING, enum: ['Doctor', 'Patient'] },
              text: { type: Type.STRING },
            },
            required: ['speaker', 'text'],
          },
        },
      },
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Segment processing error:", error);
    return null;
  }
};

export const cleanupTranscript = async (
  transcript: string,
  language: string
): Promise<string> => {
  const dictionaryContext = JSON.stringify(prescriptionDictionary);
  const systemInstruction = `
    You are an expert Medical Editor.
    TASK: Clean up the following medical transcript.
    
    CLEANUP RULES:
    1. Remove filler words (um, ah, like, you know).
    2. Correct diarization errors if they seem obvious.
    3. CRITICAL: Correct any misspelled medical terms, symptoms, or medications using the provided dictionary as a reference.
    4. HARD RULE: Do NOT add any medications that were not explicitly mentioned in the raw transcript. Only correct spellings of mentioned ones.
    5. Keep the output strictly in the native script of ${language}.
    6. Maintain the original meaning and conversational flow, but make it professional.
    
    DICTIONARY REFERENCE:
    ${dictionaryContext}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Raw Transcript:\n${transcript}`,
      config: { systemInstruction, temperature: 0 },
    });
    return response.text || transcript;
  } catch (error) {
    console.error("Cleanup error:", error);
    return transcript;
  }
};

export const generateSoapNote = async (
  cleanedTranscript: string,
  language: string
): Promise<string> => {
  const systemInstruction = `
    You are an expert clinical documentalist.
    TASK: Generate a professional SOAP note from the cleaned transcript.
    
    STRICT LANGUAGE RULE: All content MUST be written strictly in the native script of ${language}.
    
    STRUCTURE RULES:
    1. Use exactly these headers: ## Subjective, ## Objective, ## Assessment.
    2. SUBJECTIVE: List patient symptoms in short bullet points.
    3. OBJECTIVE: List physical findings or observations if any.
    4. ASSESSMENT: List suspected diagnoses or findings as short bullet points.
    5. DO NOT include a "Plan" or "Prescription" section here.
    6. NO markdown formatting within sections (bold/italics).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Cleaned Transcript:\n${cleanedTranscript}`,
      config: { systemInstruction, temperature: 0 },
    });
    return response.text || '';
  } catch (error) {
    console.error("SOAP generation error:", error);
    return 'Error generating SOAP note.';
  }
};

export const generatePrescription = async (
  cleanedTranscript: string,
  language: string
): Promise<string> => {
  const dictionaryContext = JSON.stringify(prescriptionDictionary);
  const protocolsContext = JSON.stringify(CLINICAL_PROTOCOLS);

  const systemInstruction = `
    You are an expert clinical pharmacologist.
    TASK: Extract and format the medication plan (Prescription) from the transcript.
    
    REFERENCE DATA:
    - Dictionary: ${dictionaryContext}
    - Clinical Protocols: ${protocolsContext}
    
    RULES:
    1. HEADER: Use "## Plan".
    2. HARD RULE: Only extract drugs that were EXPLICITLY mentioned in the cleaned transcript. Do NOT hallucinate or suggest additional drugs.
    3. VALIDATION RULE: You MUST validate and extract four parameters for every medication:
       - Name: Validate against the Dictionary.
       - Dosage: Extract the specific dose mentioned (e.g., 500mg, 1 tablet).
       - Frequency: Extract how often (e.g., once daily, BD).
       - Route: Extract the route (e.g., Oral, IV).
    4. MEDICINE FORMAT: "- Medicine Name | Dosage | Frequency | Route". 
       Example: "- Paracetamol | 500mg | Twice daily | Oral"
       If a parameter is missing, mark it as "Not specified".
    5. ADVICE: List all other instructions (diet, follow-up, warnings) in short bullet points.
    6. ACCURACY: Cross-reference with the Dictionary and Clinical Protocols to ensure correct spellings.
    7. LANGUAGE: Write strictly in the native script of ${language}.
    8. NO markdown formatting within sections (bold/italics).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Cleaned Transcript:\n${cleanedTranscript}`,
      config: { systemInstruction, temperature: 0 },
    });
    return response.text || '';
  } catch (error) {
    console.error("Prescription generation error:", error);
    return 'Error generating prescription.';
  }
};

export const generateClinicalNote = async (
  transcript: string,
  doctorProfile: DoctorProfile,
  language: string
): Promise<string> => {
  try {
    // Stage 1: Cleanup
    const cleanedTranscript = await cleanupTranscript(transcript, language);

    // Stage 2: SOAP (Subjective, Objective, Assessment)
    const soapNote = await generateSoapNote(cleanedTranscript, language);

    // Stage 3: Prescription (Plan)
    const prescription = await generatePrescription(cleanedTranscript, language);

    // Combine for final output
    return `${soapNote}\n\n${prescription}`;
  } catch (error) {
    console.error("Clinical note orchestration error:", error);
    return 'Error generating clinical note.';
  }
};

// FIX: Implemented generateCaseSummary using gemini-3-flash-preview
export const generateCaseSummary = async (messages: Message[], language: string, doctorProfile: DoctorProfile): Promise<string> => {
  const systemInstruction = `You are an expert clinical documentalist. Summarize the following doctor-patient conversation into a concise case summary for a medical record. Use ${language}.`;
  const transcript = messages.map(m => `${m.sender}: ${m.text}`).join('\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: transcript,
      config: { systemInstruction }
    });
    return response.text || "Summary not available.";
  } catch (e) {
    console.error("Summary generation error:", e);
    return "Error generating summary.";
  }
};

// FIX: Implemented getPromptInsights using structured JSON response
export const getPromptInsights = async (prompt: string, doctorProfile: DoctorProfile, language: string): Promise<PromptInsight | null> => {
  const systemInstruction = `Analyze the clinician's prompt and provide 3 key clinical terms, 3 suggestions to refine the prompt for better AI accuracy, and 3 high-value follow-up questions to ask the patient. Output in JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keyTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            followUps: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['keyTerms', 'suggestions', 'followUps']
        }
      }
    });
    return JSON.parse(response.text || '{}') as PromptInsight;
  } catch (e) {
    console.error("Insights generation error:", e);
    return null;
  }
};

// FIX: Updated streamChatResponse to use the runNexusWorkflow generator and accept parameters
export async function* streamChatResponse(params: {
  message: string;
  history: Message[];
  userRole: UserRole;
  language: string;
  activeGpt?: PreCodedGpt;
  isDoctorVerified: boolean;
  doctorProfile: DoctorProfile;
  knowledgeBaseProtocols: ClinicalProtocol[];
}) {
  yield* runNexusWorkflow({
    message: params.message,
    history: params.history,
    doctorProfile: params.doctorProfile,
    language: params.language,
    activeGpt: params.activeGpt,
    isDoctorVerified: params.isDoctorVerified,
    knowledgeBase: params.knowledgeBaseProtocols,
  });
}
