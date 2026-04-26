namespace NaturalizationPuzzle.Api.Logging;

/// <summary>
/// Sanitizes user-controlled scalar values before they are embedded in log entries
/// to prevent log forging (CWE-117). Strips line-breaking characters (CR, LF,
/// NEL, LS, PS), other C0/C1 control characters, DEL, and truncates to a fixed
/// maximum length. Intended for short user-controlled fields such as request paths,
/// query strings, route values, and header values — not for stack traces or large
/// payloads.
/// </summary>
internal static class LogSanitizer
{
    internal const int MaxLength = 4096;
    internal const int MaxStackTraceLength = 32 * 1024;
    private const char Replacement = '_';

    public static string Clean(string? value) => Clean(value, MaxLength);

    public static string Clean(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        // Mandatory CR/LF removal first: CodeQL's cs/log-forging rule recognizes
        // String.Replace of '\r'/'\n' as a sanitizer, so this must be present and
        // visible at the top of the method even though the loop below would also
        // catch them.
        var safe = value.Replace('\r', Replacement).Replace('\n', Replacement);

        if (NeedsControlCharStripping(safe))
        {
            safe = StripControlChars(safe);
        }

        if (safe.Length > maxLength)
        {
            safe = string.Concat(
                safe.AsSpan(0, maxLength),
                $"…[truncated:{value.Length}]");
        }

        return safe;
    }

    private static bool NeedsControlCharStripping(string value)
    {
        foreach (var c in value)
        {
            if (IsBanned(c))
            {
                return true;
            }
        }
        return false;
    }

    private static string StripControlChars(string value)
    {
        return string.Create(value.Length, value, static (span, source) =>
        {
            for (var i = 0; i < source.Length; i++)
            {
                var c = source[i];
                span[i] = IsBanned(c) ? Replacement : c;
            }
        });
    }

    private static bool IsBanned(char c)
    {
        // Preserve TAB; strip all other control characters (C0 + C1 + DEL via
        // char.IsControl) plus the Unicode line/paragraph separators that some
        // log viewers honor as line breaks.
        if (c == '\t')
        {
            return false;
        }
        return char.IsControl(c) || c == '\u2028' || c == '\u2029';
    }
}
