
import type { ReactElement } from 'react';

export enum UserRole {
  DOCTOR = 'Doctor',
}

export type Sender = 'USER' | 'AI';

export interface Citation {
  uri: string;
  title: string;
}

export interface DoctorProfile {
    qualification: 'MBBS' | 'BAMS' | 'BHMS';
    canPrescribeAllopathic: 'yes' | 'limited' | 'no';
}

// Types for Structured AI Responses
export interface DdxItem {
  diagnosis: string;
  rationale: string;
  confidence: 'High' | 'Medium' | 'Low';
}

// Doctor-specific types
export interface LabParameter {
  parameter: string;
  value: string;
  referenceRange: string;
  interpretation: string;
  urgency: 'Normal' | 'Abnormal' | 'Critical';
}

export interface LabResultAnalysis {
  overallInterpretation: string;
  results: LabParameter[];
}

export interface MedicalCode {
  code: string;
  description: string;
}

export interface MedicalCodeResult {
  query: string;
  codes: MedicalCode[];
}

export interface HandoutSection {
  heading: string;
  content: string;
}

export interface PatientHandout {
  title: string;
  introduction: string;
  sections: HandoutSection[];
  disclaimer: string;
}

export interface RiskAssessmentResult {
    riskLevel: 'Low' | 'Medium' | 'High';
    riskFactors: string[];
    recommendations: string[];
    summary: string;
}

export type LabParameterInput = {
    name: string;
    value: string;
    units: string;
    referenceRange: string;
};


export type StructuredDataType = 
  | { type: 'ddx'; data: DdxItem[]; summary: string; questions?: string[] }
  | { type: 'lab'; data: LabResultAnalysis; summary: string }
  | { type: 'billing'; data: MedicalCodeResult; summary: string }
  | { type: 'handout'; data: PatientHandout; summary: string }
  | { type: 'risk-assessment'; data: RiskAssessmentResult; summary: string };


export interface Message {
  id: string;
  sender: Sender;
  text: string;
  citations?: Citation[];
  structuredData?: StructuredDataType;
  feedback?: 'good' | 'bad' | null;
  // --- Safety & Audit Fields ---
  source_protocol_id?: string;
  source_protocol_last_reviewed?: string;
  action_type?: 'Informational' | 'Requires Clinician Confirmation';
  is_confirmed?: boolean;
}

export interface Chat {
  id:string;
  title: string;
  messages: Message[];
  userRole: UserRole;
  gptId?: string;
}

export interface PreCodedGpt {
  id: string;
  title: string;
  description: string;
  icon: ReactElement;
  roles: UserRole[];
  customComponentId?: 'PregnancyRiskAssessment' | 'LabResultAnalysis' | 'DifferentialDiagnosis';
}

// Types for Scribe Session
export type ScribeInsightCategory = 'Differential Diagnosis' | 'Questions to Ask' | 'Labs to Consider' | 'General Note';

export interface ScribeInsightBlock {
    category: ScribeInsightCategory;
    points: string[];
}

export interface TranscriptEntry {
    id: string;
    speaker: 'Doctor' | 'Patient' | 'AI';
    text: string;
    segmentIndex?: number;
}

export interface PromptInsight {
    keyTerms: string[];
    suggestions: string[];
    followUps: string[];
}

// --- Clinical Knowledge Base Schema ---

export interface ProtocolReviewer {
  name: string;
  date: string;
  comments: string;
}

export interface ProtocolMetadata {
  version: string;
  date_effective: string;
  last_reviewed: string;
  authors: string[];
  institution: string;
  jurisdiction: string[];
  scope: string;
  'use_if_conditions': string[];
  canonical_sources: { name: string; url?: string }[];
  reviewer_signoff: ProtocolReviewer[];
  related_protocols?: string[];
}

export interface ProtocolStep {
  id: string;
  timing: string;
  title: string;
  actions: string[];
  is_critical: boolean;
  troubleshooting?: string[];
}

export interface DosingInfo {
  drug_name: string;
  brand_names_india: string[];
  available_strengths: string[];
  formula: string;
  route: string;
  dilution_instructions: string;
  administration_details: string;
  max_dose?: string;
  monitoring: string[];
  contraindications?: string[];
  reversal_agent?: string;
}

export interface EscalationTrigger {
  condition: string;
  action: string;
  requires_confirmation: boolean;
}

export interface MonitoringParameter {
    parameter: string;
    frequency: string;
    normal_range?: string;
}

export interface MonitoringTemplate {
    title: string;
    parameters: MonitoringParameter[];
    alert_triggers: { condition: string, action: string }[];
}


export interface ClinicalProtocol {
  id: string;
  title: string;
  metadata: ProtocolMetadata;
  preconditions: string[];
  settings: ('Primary' | 'Secondary' | 'Tertiary' | 'Emergency' | 'ICU' | 'Ward' | 'Community')[];
  stepwise_actions: ProtocolStep[];
  dosing_table: DosingInfo[];
  monitoring_template: MonitoringTemplate;
  contraindications_general: string[];
  escalation_triggers: EscalationTrigger[];
  references: { citation: string; url?: string }[];
}
