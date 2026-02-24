export interface QuestionDto {
  readonly id: number;
  readonly text: string;
  readonly category: string;
  readonly subCategory: string;
  readonly is6520Designated: boolean;
  readonly answers: readonly string[];
}

export interface UsStateDto {
  readonly id: number;
  readonly name: string;
  readonly abbreviation: string;
  readonly capital: string;
  readonly governor: string;
  readonly senatorOne: string;
  readonly senatorTwo: string;
  readonly representatives: readonly string[];
}

export interface QuizStartRequest {
  readonly stateId: number;
  readonly is6520Mode: boolean;
}

export interface QuizResultDto {
  readonly sessionId: string;
  readonly totalQuestions: number;
  readonly correctAnswers: number;
  readonly incorrectAnswers: number;
  readonly isComplete: boolean;
  readonly passed: boolean;
}

export type ApiResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };

export interface QuizAnswer {
  readonly questionId: number;
  readonly questionText: string;
  readonly userAnswer: string;
  readonly acceptedAnswers: readonly string[];
  readonly isCorrect: boolean;
}

export interface VacantSeatDto {
  readonly id: number;
  readonly stateId: number;
  readonly stateName: string;
  readonly district: string;
}

export interface RepresentativeDto {
  readonly id: number;
  readonly stateId: number;
  readonly district: string;
  readonly name: string;
}
