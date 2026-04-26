using System.Net;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NaturalizationPuzzle.Api.Logging;

namespace NaturalizationPuzzle.Api.Middleware;

public sealed class GlobalExceptionHandler(
    ILogger<GlobalExceptionHandler> logger,
    IOptions<ExceptionLoggingOptions> options) : IExceptionHandler
{
    private readonly ExceptionLoggingOptions _options = options.Value;

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var correlationId = Guid.NewGuid().ToString();
        var sanitizedPath = httpContext.Request.Path.ForLog();

        if (_options.IncludeRawException)
        {
            // Debug-only path: hands the raw Exception object to the logger so
            // OpenTelemetry / Application Insights can emit structured exception
            // telemetry. Plaintext sinks may render exception.ToString() and
            // expose unsanitized exception messages — accept that risk in
            // exchange for full-fidelity debugging telemetry.
            logger.LogError(exception,
                "Unhandled exception occurred. CorrelationId: {CorrelationId}, Path: {Path}",
                correlationId,
                sanitizedPath);
        }
        else
        {
            // Production-safe path: log sanitized exception fields without
            // passing the raw Exception object, guaranteeing CWE-117 safety on
            // every sink at the cost of structured exception telemetry.
            logger.LogError(
                "Unhandled exception occurred. CorrelationId: {CorrelationId}, Path: {Path}, ExceptionType: {ExceptionType}, ExceptionMessage: {ExceptionMessage}, ExceptionStackTrace: {ExceptionStackTrace}",
                correlationId,
                sanitizedPath,
                LogSanitizer.Clean(exception.GetType().FullName),
                LogSanitizer.Clean(exception.Message),
                LogSanitizer.Clean(exception.StackTrace, LogSanitizer.MaxStackTraceLength));
        }

        var problemDetails = new ProblemDetails
        {
            Status = (int)HttpStatusCode.InternalServerError,
            Title = "An unexpected error occurred",
            Detail = httpContext.RequestServices
                .GetRequiredService<IHostEnvironment>()
                .IsDevelopment()
                    ? exception.Message
                    : "Please try again later.",
            Instance = httpContext.Request.Path,
            Extensions = { ["correlationId"] = correlationId }
        };

        httpContext.Response.StatusCode = problemDetails.Status.Value;
        await httpContext.Response.WriteAsJsonAsync(problemDetails, cancellationToken);

        return true;
    }
}
