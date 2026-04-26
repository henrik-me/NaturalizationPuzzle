using NaturalizationPuzzle.Api.Logging;

namespace NaturalizationPuzzle.Api.Tests.Logging;

public sealed class LogSanitizerTests
{
    [Fact]
    public void Clean_Null_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, LogSanitizer.Clean(null));
    }

    [Fact]
    public void Clean_Empty_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, LogSanitizer.Clean(string.Empty));
    }

    [Fact]
    public void Clean_PlainAscii_Unchanged()
    {
        const string input = "/api/v1/questions?state=CA";
        Assert.Equal(input, LogSanitizer.Clean(input));
    }

    [Fact]
    public void Clean_NonAsciiAndEmoji_Unchanged()
    {
        const string input = "Ümlauts and 🎉 emoji and 中文";
        Assert.Equal(input, LogSanitizer.Clean(input));
    }

    [Fact]
    public void Clean_PreservesTab()
    {
        Assert.Equal("a\tb", LogSanitizer.Clean("a\tb"));
    }

    [Theory]
    [InlineData("a\rb", "a_b")]
    [InlineData("a\nb", "a_b")]
    [InlineData("a\r\nb", "a__b")]
    [InlineData("a\u0085b", "a_b")]      // NEL
    [InlineData("a\u2028b", "a_b")]      // LS
    [InlineData("a\u2029b", "a_b")]      // PS
    [InlineData("a\u0000b", "a_b")]      // NUL
    [InlineData("a\u0007b", "a_b")]      // BEL
    [InlineData("a\u0008b", "a_b")]      // BS
    [InlineData("a\u001bb", "a_b")]      // ESC (ANSI escape vector)
    [InlineData("a\u007fb", "a_b")]      // DEL
    [InlineData("a\u0080b", "a_b")]      // C1 PAD
    [InlineData("a\u009fb", "a_b")]      // C1 APC
    public void Clean_ReplacesBannedChars(string input, string expected)
    {
        Assert.Equal(expected, LogSanitizer.Clean(input));
    }

    [Fact]
    public void Clean_LogForgingAttack_NeutralizesNewlines()
    {
        const string input = "/q\r\n2026-01-01 ERROR Spoofed entry";
        var actual = LogSanitizer.Clean(input);
        Assert.DoesNotContain('\r', actual);
        Assert.DoesNotContain('\n', actual);
        Assert.Equal("/q__2026-01-01 ERROR Spoofed entry", actual);
    }

    [Fact]
    public void Clean_AnsiEscapeInjection_NeutralizesEsc()
    {
        const string input = "user\u001b[31mFAKE-RED\u001b[0m";
        var actual = LogSanitizer.Clean(input);
        Assert.DoesNotContain('\u001b', actual);
    }

    [Fact]
    public void Clean_AtMaxLength_NotTruncated()
    {
        var input = new string('a', LogSanitizer.MaxLength);
        var actual = LogSanitizer.Clean(input);
        Assert.Equal(input, actual);
        Assert.DoesNotContain("truncated", actual);
    }

    [Fact]
    public void Clean_OverMaxLength_TruncatesWithMarker()
    {
        var input = new string('a', LogSanitizer.MaxLength + 100);
        var actual = LogSanitizer.Clean(input);

        Assert.StartsWith(new string('a', LogSanitizer.MaxLength), actual);
        Assert.Contains($"truncated:{input.Length}", actual);
    }

    [Fact]
    public void Clean_OverMaxLengthWithControlChars_StripsThenTruncates()
    {
        var input = new string('a', LogSanitizer.MaxLength) + "\r\nEXTRA";
        var actual = LogSanitizer.Clean(input);

        Assert.DoesNotContain('\r', actual);
        Assert.DoesNotContain('\n', actual);
        Assert.Contains($"truncated:{input.Length}", actual);
    }

    [Fact]
    public void Clean_IsIdempotent()
    {
        const string input = "/q\r\n\u001b[31mhi\t/end";
        var once = LogSanitizer.Clean(input);
        var twice = LogSanitizer.Clean(once);
        Assert.Equal(once, twice);
    }

    [Fact]
    public void ForLog_String_DelegatesToClean()
    {
        Assert.Equal("a_b", "a\nb".ForLog());
    }

    [Fact]
    public void ForLog_PathString_DelegatesToClean()
    {
        var path = new Microsoft.AspNetCore.Http.PathString("/a\nb");
        Assert.Equal("/a_b", path.ForLog());
    }

    [Fact]
    public void ForLog_DefaultPathString_ReturnsEmpty()
    {
        var path = default(Microsoft.AspNetCore.Http.PathString);
        Assert.Equal(string.Empty, path.ForLog());
    }

    [Fact]
    public void ForLog_QueryString_DelegatesToClean()
    {
        var query = new Microsoft.AspNetCore.Http.QueryString("?x=1\n2");
        Assert.Equal("?x=1_2", query.ForLog());
    }

    [Fact]
    public void ForLog_DefaultQueryString_ReturnsEmpty()
    {
        var query = default(Microsoft.AspNetCore.Http.QueryString);
        Assert.Equal(string.Empty, query.ForLog());
    }
}
