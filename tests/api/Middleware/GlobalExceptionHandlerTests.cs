using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NaturalizationPuzzle.Api.Logging;
using NaturalizationPuzzle.Api.Middleware;

namespace NaturalizationPuzzle.Api.Tests.Middleware;

public sealed class GlobalExceptionHandlerTests
{
    [Fact]
    public async Task TryHandleAsync_DefaultMode_LogsSanitizedFields_NoRawException_NoNewlines()
    {
        var logger = new RecordingLogger<GlobalExceptionHandler>();
        var handler = CreateHandler(logger, includeRawException: false);
        var ctx = NewContext("/api/v1/q\r\nFAKE LOG ENTRY");

        var ex = MakeExceptionWithNewlinesInMessage();
        var handled = await handler.TryHandleAsync(ctx, ex, CancellationToken.None);

        Assert.True(handled);
        var entry = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Error, entry.Level);

        // Default mode must NOT pass the raw Exception to the logger — sanitized
        // exception fields are emitted as structured values instead.
        Assert.Null(entry.Exception);

        var rendered = entry.Formatter(entry.State, entry.Exception);
        Assert.DoesNotContain('\r', rendered);
        Assert.DoesNotContain('\n', rendered);
        Assert.Contains("FAKE LOG ENTRY", rendered);
        Assert.Contains("InvalidOperationException", rendered);
        // Exception message contained CR/LF; rendered output must show sanitized form.
        Assert.Contains("evil_message_part2", rendered);
    }

    [Fact]
    public async Task TryHandleAsync_IncludeRawExceptionMode_PassesRawException()
    {
        var logger = new RecordingLogger<GlobalExceptionHandler>();
        var handler = CreateHandler(logger, includeRawException: true);
        var ctx = NewContext("/api/v1/x");

        var ex = new InvalidOperationException("boom");
        await handler.TryHandleAsync(ctx, ex, CancellationToken.None);

        var entry = Assert.Single(logger.Entries);
        Assert.Same(ex, entry.Exception);
        // Path is still sanitized even in the raw-exception mode.
        var rendered = entry.Formatter(entry.State, entry.Exception);
        Assert.Contains("/api/v1/x", rendered);
    }

    [Fact]
    public async Task TryHandleAsync_WritesProblemDetailsResponse()
    {
        var logger = new RecordingLogger<GlobalExceptionHandler>();
        var handler = CreateHandler(logger, includeRawException: false);
        var ctx = NewContext("/api/v1/x");

        await handler.TryHandleAsync(ctx, new InvalidOperationException("boom"), CancellationToken.None);

        Assert.Equal(StatusCodes.Status500InternalServerError, ctx.Response.StatusCode);
        ctx.Response.Body.Position = 0;
        using var reader = new StreamReader(ctx.Response.Body);
        var body = await reader.ReadToEndAsync();
        Assert.Contains("correlationId", body);
    }

    private static GlobalExceptionHandler CreateHandler(
        ILogger<GlobalExceptionHandler> logger,
        bool includeRawException)
    {
        var options = Options.Create(new ExceptionLoggingOptions
        {
            IncludeRawException = includeRawException,
        });
        return new GlobalExceptionHandler(logger, options);
    }

    private static DefaultHttpContext NewContext(string path)
    {
        var ctx = new DefaultHttpContext
        {
            Request = { Path = new PathString(path) },
            Response = { Body = new MemoryStream() },
        };
        ctx.RequestServices = new MinimalServiceProvider();
        return ctx;
    }

    private static InvalidOperationException MakeExceptionWithNewlinesInMessage()
    {
        // Throw and catch so the exception has a real stack trace.
        try
        {
            throw new InvalidOperationException("evil_message_part1\r\nFORGED LOG\r\nevil_message_part2");
        }
        catch (InvalidOperationException caught)
        {
            return caught;
        }
    }

    private sealed class RecordingLogger<T> : ILogger<T>
    {
        public List<LogEntry> Entries { get; } = new();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            Entries.Add(new LogEntry(
                logLevel,
                state!,
                exception,
                (s, e) => formatter((TState)s!, e)));
        }

        public sealed record LogEntry(
            LogLevel Level,
            object State,
            Exception? Exception,
            Func<object, Exception?, string> Formatter);
    }

    private sealed class MinimalServiceProvider : IServiceProvider
    {
        public object? GetService(Type serviceType)
        {
            if (serviceType == typeof(Microsoft.Extensions.Hosting.IHostEnvironment))
            {
                return new TestHostEnvironment();
            }
            return null;
        }

        private sealed class TestHostEnvironment : Microsoft.Extensions.Hosting.IHostEnvironment
        {
            public string EnvironmentName { get; set; } = "Production";
            public string ApplicationName { get; set; } = "Tests";
            public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
            public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
                new Microsoft.Extensions.FileProviders.NullFileProvider();
        }
    }
}
