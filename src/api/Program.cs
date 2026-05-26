using System.IO.Compression;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Endpoints;
using NaturalizationPuzzle.Api.Logging;
using NaturalizationPuzzle.Api.Middleware;
using NaturalizationPuzzle.Api.Services;

var builder = WebApplication.CreateBuilder(args);

if (!string.IsNullOrEmpty(builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]))
{
    builder.Services.AddOpenTelemetry().UseAzureMonitor();
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Data Source=naturalization.db"));

builder.Services.AddScoped<IQuestionService, QuestionService>();
builder.Services.AddScoped<IStateService, StateService>();
builder.Services.AddScoped<IQuizService, QuizService>();
builder.Services.AddScoped<IRepresentativeService, RepresentativeService>();
builder.Services.AddScoped<IStoryService, StoryService>();

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.Configure<ExceptionLoggingOptions>(
    builder.Configuration.GetSection(ExceptionLoggingOptions.SectionName));

// Response compression for JSON API payloads. The largest endpoint
// (/api/v1/questions) returns the full 128-question pool with tags + answers
// and benefits substantially from Brotli/Gzip. SAFETY: EnableForHttps opts in
// to compression over TLS — this is normally avoided due to CRIME/BREACH-class
// attacks, but the threat model does not apply here: responses are public
// read-only civics data with no per-user secrets in the body. Compression
// level Fastest is the sweet spot for on-the-fly API responses (Optimal is
// ~10x slower for marginal additional size reduction on small JSON).
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["application/json"]);
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);

builder.Services.AddOpenApi();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("https://localhost:5173", "http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseExceptionHandler();
app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// Must come before UseStaticFiles and endpoint mapping so it can compress
// both static-file responses and API responses on the way out.
app.UseResponseCompression();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapQuestionEndpoints();
app.MapStateEndpoints();
app.MapQuizEndpoints();
app.MapRepresentativeEndpoints();
app.MapStoryEndpoints();
app.MapHealthEndpoints();
app.MapFallbackToFile("index.html");

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    await EnsureDatabaseSchemaAsync(db, logger, app.Environment.IsDevelopment());
}

app.Run();

// One-time recovery for SQLite databases created before the Question.Tags column
// was added. The project uses EnsureCreatedAsync (no migrations), so a pre-existing
// DB file will silently keep the old schema and queries on Tags will fail at read.
//
// In Development the safe recovery is to drop and recreate the file (all dev data is
// disposable seed). In any non-Development environment we refuse to delete the DB —
// representative edits and any future writes are persisted server-side and must not
// be silently destroyed — and instead throw a clear startup error so an operator can
// run a migration or recreate the DB intentionally.
//
// This block can be removed once migrations are introduced (tracked separately).
static async Task EnsureDatabaseSchemaAsync(AppDbContext db, ILogger logger, bool isDevelopment)
{
    if (await db.Database.CanConnectAsync())
    {
        var conn = db.Database.GetDbConnection();
        await conn.OpenAsync();
        try
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name='Questions';";
            var hasQuestions = await cmd.ExecuteScalarAsync() is not null;
            if (hasQuestions)
            {
                cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Questions') WHERE name='Tags';";
                var tagsColumnCount = Convert.ToInt32(await cmd.ExecuteScalarAsync() ?? 0);
                if (tagsColumnCount == 0)
                {
                    if (!isDevelopment)
                    {
                        logger.LogError("Existing database is missing the Questions.Tags column. Refusing to auto-recover outside Development to avoid destroying persisted data. Apply a schema migration or recreate the database manually.");
                        throw new InvalidOperationException(
                            "Database schema is out of date: 'Questions.Tags' column is missing. Auto-recovery is disabled outside Development.");
                    }
                    logger.LogWarning("Existing development database is missing the Questions.Tags column; dropping and recreating with fresh seed data.");
                    await conn.CloseAsync();
                    await db.Database.EnsureDeletedAsync();
                }
            }
        }
        finally
        {
            if (conn.State == System.Data.ConnectionState.Open)
            {
                await conn.CloseAsync();
            }
        }
    }

    await db.Database.EnsureCreatedAsync();
}

public partial class Program { }
