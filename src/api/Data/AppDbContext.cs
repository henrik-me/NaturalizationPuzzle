using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NaturalizationPuzzle.Api.Models;
using System.Text.Json;

namespace NaturalizationPuzzle.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<Answer> Answers => Set<Answer>();
    public DbSet<UsState> States => Set<UsState>();
    public DbSet<Representative> Representatives => Set<Representative>();
    public DbSet<QuizSession> QuizSessions => Set<QuizSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Tags are a small read-only list of namespaced strings (e.g. "people:Lincoln",
        // "wars:Civil War"). Stored as JSON in a single TEXT column to keep the schema
        // simple. Server-side filtering by tag is intentionally NOT supported — the
        // client filters in-memory after loading the question set.
        var tagsConverter = new ValueConverter<IReadOnlyList<string>, string>(
            v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => JsonSerializer.Deserialize<IReadOnlyList<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>());

        var tagsComparer = new ValueComparer<IReadOnlyList<string>>(
            (a, b) => (a ?? new List<string>()).SequenceEqual(b ?? new List<string>()),
            v => v.Aggregate(0, (h, s) => HashCode.Combine(h, s.GetHashCode())),
            v => v.ToList());

        modelBuilder.Entity<Question>(entity =>
        {
            entity.HasKey(q => q.Id);
            entity.Property(q => q.Text).IsRequired().HasMaxLength(500);
            entity.Property(q => q.Category).IsRequired().HasMaxLength(100);
            entity.Property(q => q.SubCategory).IsRequired().HasMaxLength(100);
            entity.Property(q => q.Tags)
                  .HasConversion(tagsConverter, tagsComparer)
                  .HasColumnType("TEXT")
                  .IsRequired();
            entity.HasMany(q => q.Answers)
                  .WithOne()
                  .HasForeignKey(a => a.QuestionId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Answer>(entity =>
        {
            entity.HasKey(a => a.Id);
            entity.Property(a => a.Text).IsRequired().HasMaxLength(500);
        });

        modelBuilder.Entity<UsState>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Name).IsRequired().HasMaxLength(50);
            entity.Property(s => s.Abbreviation).IsRequired().HasMaxLength(2);
            entity.HasIndex(s => s.Abbreviation).IsUnique();
        });

        modelBuilder.Entity<Representative>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Name).IsRequired().HasMaxLength(100);
            entity.Property(r => r.District).IsRequired().HasMaxLength(20);
        });

        modelBuilder.Entity<QuizSession>(entity =>
        {
            entity.HasKey(qs => qs.Id);
            entity.Property(qs => qs.SessionId).IsRequired().HasMaxLength(36);
            entity.HasIndex(qs => qs.SessionId).IsUnique();
        });

        SeedData.Seed(modelBuilder);
        RepresentativeSeedData.Seed(modelBuilder);
    }
}
