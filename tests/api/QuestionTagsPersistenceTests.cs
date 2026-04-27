using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Tests;

/// <summary>
/// SQLite-backed tests that exercise the EF value converter and value comparer
/// for <see cref="Question.Tags"/>. The standard <c>QuestionServiceTests</c>
/// suite uses the InMemory provider, which stores collections as live references
/// and therefore does NOT round-trip the JSON converter at all.
/// </summary>
public sealed class QuestionTagsPersistenceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<AppDbContext> _options;

    public QuestionTagsPersistenceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        _options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        using var db = new AppDbContext(_options);
        db.Database.EnsureCreated();
    }

    [Fact]
    public async Task Tags_RoundTripThroughJsonConverter()
    {
        await using (var write = new AppDbContext(_options))
        {
            // Q1 in the seed has Tags = []; explicitly overwrite to verify round-trip
            // of a non-empty namespaced list (single-shape source of truth).
            var q = await write.Questions.FirstAsync(x => x.Id == 1);
            write.Entry(q).Property(p => p.Tags).CurrentValue =
                new List<string> { "people:Test", "wars:Test", "timePeriod:1700s" };
            await write.SaveChangesAsync();
        }

        await using (var read = new AppDbContext(_options))
        {
            var q = await read.Questions.AsNoTracking().FirstAsync(x => x.Id == 1);
            Assert.Equal(
                new[] { "people:Test", "wars:Test", "timePeriod:1700s" },
                q.Tags);
        }
    }

    [Fact]
    public async Task Tags_PersistOrder()
    {
        await using (var write = new AppDbContext(_options))
        {
            var q = await write.Questions.FirstAsync(x => x.Id == 2);
            write.Entry(q).Property(p => p.Tags).CurrentValue =
                new List<string> { "z:third", "a:first", "m:second" };
            await write.SaveChangesAsync();
        }

        await using (var read = new AppDbContext(_options))
        {
            var q = await read.Questions.AsNoTracking().FirstAsync(x => x.Id == 2);
            Assert.Equal(new[] { "z:third", "a:first", "m:second" }, q.Tags);
        }
    }

    [Fact]
    public async Task Tags_EmptyList_RoundTripsAsEmpty()
    {
        await using var read = new AppDbContext(_options);
        // Q1 has no tags in seed; verify it deserializes as an empty list, not null.
        var q = await read.Questions.AsNoTracking().FirstAsync(x => x.Id == 1);
        Assert.NotNull(q.Tags);
        Assert.Empty(q.Tags);
    }

    [Fact]
    public async Task Tags_StoredAsJsonText()
    {
        await using var db = new AppDbContext(_options);
        var conn = db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
        {
            await conn.OpenAsync();
        }
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Tags FROM Questions WHERE Id = 76;";
        var raw = (string?)await cmd.ExecuteScalarAsync();
        Assert.NotNull(raw);
        // Q76 has wars:Revolutionary War + timePeriod:1700s — both should be
        // present as JSON-serialized strings.
        Assert.Contains("wars:Revolutionary War", raw);
        Assert.Contains("timePeriod:1700s", raw);
        Assert.StartsWith("[", raw.TrimStart());
    }

    public void Dispose() => _connection.Dispose();
}
