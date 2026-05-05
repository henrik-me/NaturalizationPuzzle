using NaturalizationPuzzle.Api.Services;
using Xunit;

namespace NaturalizationPuzzle.Api.Tests;

/// <summary>
/// Direct unit tests for <see cref="StoryParser"/> validation rules — uses
/// inline string fixtures so the rules can be exercised without committing
/// a malformed file to content/stories. Pairs with <see cref="StoryContentTests"/>
/// which validates the real shipped pilot stories.
/// </summary>
public sealed class StoryParserTests
{
    private const string MinimalFrontmatter = """
        ---
        slug: test
        title: Test Story
        category: American Government
        subCategory: System of Government
        questionIds: [15]
        readingLevelMin: 1
        ---
        ## Heading

        A paragraph with a citation [1].
        """;

    private static string SourcesJson(string url) =>
        $$"""
        {
          "sources": [
            { "id": 1, "title": "T", "url": "{{url}}", "type": "wikipedia", "supportSnippet": "snip snip" }
          ]
        }
        """;

    [Fact]
    public void Parse_AcceptsHttpsSourceUrl()
    {
        var story = StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("https://en.wikipedia.org/wiki/Test"));
        Assert.Single(story.Sources);
        Assert.Equal("https://en.wikipedia.org/wiki/Test", story.Sources[0].Url);
    }

    [Fact]
    public void Parse_AcceptsHttpSourceUrl()
    {
        var story = StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("http://example.gov/x"));
        Assert.Single(story.Sources);
    }

    [Fact]
    public void Parse_AcceptsMailtoSourceUrl()
    {
        var story = StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("mailto:archives@example.gov"));
        Assert.Single(story.Sources);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html,<script>alert(1)</script>")]
    [InlineData("vbscript:msgbox(1)")]
    [InlineData("file:///etc/passwd")]
    [InlineData("ftp://example.com/x")]
    public void Parse_RejectsUnsafeSourceUrlSchemes(string unsafeUrl)
    {
        // Final-diff review fix #1: unsafe schemes in source URLs must fail at
        // parse time so they cannot reach the client (where StoryPage renders
        // s.url into a raw href). Defense in depth, paired with isSafeSourceUrl
        // on the client.
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, SourcesJson(unsafeUrl)));
        Assert.Contains("disallowed scheme", ex.Message);
    }

    [Fact]
    public void Parse_RejectsEmptySourceUrl()
    {
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("")));
        Assert.Contains("empty url", ex.Message);
    }

    [Fact]
    public void Parse_RejectsRelativeSourceUrl()
    {
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("/relative/path")));
        Assert.Contains("not absolute", ex.Message);
    }
}
