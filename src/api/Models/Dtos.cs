namespace NaturalizationPuzzle.Api.Models;

public sealed record QuestionDto(
    int Id,
    string Text,
    string Category,
    string SubCategory,
    bool Is6520Designated,
    IReadOnlyList<string> Answers);

public sealed record UsStateDto(
    int Id,
    string Name,
    string Abbreviation,
    string Capital,
    string Governor,
    string SenatorOne,
    string SenatorTwo,
    IReadOnlyList<string> Representatives);

public sealed record RepresentativeDto(
    int Id,
    int StateId,
    string District,
    string Name);

public sealed record VacantSeatDto(
    int Id,
    int StateId,
    string StateName,
    string District);

public sealed record UpdateRepresentativeRequest(
    string Name);

public sealed record QuizStartRequest(
    int StateId,
    bool Is6520Mode);

public sealed record QuizAnswerRequest(
    int QuestionId,
    string Answer);

public sealed record QuizResultDto(
    string SessionId,
    int TotalQuestions,
    int CorrectAnswers,
    int IncorrectAnswers,
    bool IsComplete,
    bool Passed);
