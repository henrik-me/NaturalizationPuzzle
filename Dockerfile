# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app/client
COPY src/client/package*.json src/client/.npmrc ./
RUN npm ci
COPY src/client/ ./
RUN npm run build

# Stage 2: Build and publish backend
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-build
WORKDIR /app
COPY src/api/NaturalizationPuzzle.Api.csproj src/api/
RUN dotnet restore src/api/NaturalizationPuzzle.Api.csproj
COPY src/api/ src/api/
# Story Mode catalog content. NaturalizationPuzzle.Api.csproj embeds
# `..\..\content\stories\*.md` and `*.sources.json` as EmbeddedResources.
# MSBuild resolves Include paths relative to the .csproj file's
# directory, so the literal target is `<dir-of-csproj>/../../content/`.
# In a normal local build the csproj sits at <repo>/src/api/, the relative
# path resolves to <repo>/content/, and the Includes match. Inside this
# Docker build context the csproj is COPYed to /app/src/api/ but
# /app/content/ doesn't exist unless we explicitly add it — without this
# COPY the Includes silently match zero files, the published DLL ships
# with no embedded story resources, and /api/v1/stories returns [].
# Note: .dockerignore must allow these files through — see the
# `!content/stories/*.md` exception there. The Image Smoke Test step in
# .github/workflows/ci-cd.yml asserts
# `/api/v1/stories | jq -e 'length >= 3'` to guard against regressions
# of either kind.
COPY content/ content/
COPY --from=frontend-build /app/client/dist/ src/api/wwwroot/
RUN dotnet publish src/api/NaturalizationPuzzle.Api.csproj -c Release -o /publish --no-restore

# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=backend-build /publish .

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

ENTRYPOINT ["dotnet", "NaturalizationPuzzle.Api.dll"]
