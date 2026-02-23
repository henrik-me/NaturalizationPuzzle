using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<Answer> Answers => Set<Answer>();
    public DbSet<UsState> States => Set<UsState>();
    public DbSet<QuizSession> QuizSessions => Set<QuizSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Question>(entity =>
        {
            entity.HasKey(q => q.Id);
            entity.Property(q => q.Text).IsRequired().HasMaxLength(500);
            entity.Property(q => q.Category).IsRequired().HasMaxLength(100);
            entity.Property(q => q.SubCategory).IsRequired().HasMaxLength(100);
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

        modelBuilder.Entity<QuizSession>(entity =>
        {
            entity.HasKey(qs => qs.Id);
            entity.Property(qs => qs.SessionId).IsRequired().HasMaxLength(36);
            entity.HasIndex(qs => qs.SessionId).IsUnique();
        });

        SeedData.Seed(modelBuilder);
    }
}
