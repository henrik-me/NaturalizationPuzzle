namespace NaturalizationPuzzle.Api.Logging;

/// <summary>
/// Controls how unhandled exceptions are written to logs by
/// <see cref="Middleware.GlobalExceptionHandler"/>.
/// </summary>
public sealed class ExceptionLoggingOptions
{
    public const string SectionName = "Logging:Exceptions";

    /// <summary>
    /// When <c>false</c> (default, production-safe), the global exception handler
    /// logs the exception type, sanitized message, and sanitized stack trace as
    /// separate structured fields, and does NOT pass the raw <see cref="System.Exception"/>
    /// to the logger. This guarantees CWE-117 (log forging) safety on every log
    /// sink, including plaintext console/file sinks, even if exception messages
    /// contain attacker-controlled CR/LF or control characters.
    ///
    /// When <c>true</c> (debugging), the raw <see cref="System.Exception"/> is
    /// passed to the logger, restoring first-class structured exception telemetry
    /// for OpenTelemetry / Application Insights at the cost of plaintext-sink
    /// log-forging safety. Use only for debugging, not in untrusted environments.
    /// </summary>
    public bool IncludeRawException { get; set; }
}
