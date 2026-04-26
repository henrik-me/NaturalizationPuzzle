using Microsoft.AspNetCore.Http;

namespace NaturalizationPuzzle.Api.Logging;

internal static class LogSanitizerExtensions
{
    public static string ForLog(this string? value) => LogSanitizer.Clean(value);

    public static string ForLog(this PathString path) => LogSanitizer.Clean(path.Value);

    public static string ForLog(this QueryString query) => LogSanitizer.Clean(query.Value);
}
