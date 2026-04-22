# Release Notes: Auth Cleanup, Model Fetching & Local OCR

## Summary
This release simplifies AI provider authentication, automatically fetches available models when you enter your API key, and adds a local OCR engine for extracting text from your screen.

## What's New

### Model Auto-Discovery
- **Automatic Model Fetching**: When you enter an API key in Settings, GQuick now automatically fetches and displays the available models from your provider
- **Supported Providers**: OpenAI, Google Gemini, Kimi/Moonshot, and Anthropic Claude
- **Smart Caching**: Fetched models are cached locally for 24 hours to reduce API calls and improve performance
- **Selected Model Display**: Your currently selected model is now shown in the chat header for easy reference
- **Race Condition Prevention**: Uses AbortController to handle rapid key changes gracefully

### Local OCR Engine
- **Real OCR Processing**: Replaced the mocked OCR with actual Tesseract OCR powered by the Rust `tesseract` crate
- **Global Shortcut**: Press `Alt+O` to capture any screen region and extract text
- **Clipboard Integration**: Extracted text is automatically copied to your clipboard
- **Preview Notification**: See a preview of the extracted text in a system notification
- **Graceful Degradation**: Clear error message if Tesseract is not installed on your system

## Changes

### Authentication Simplification
- Removed OAuth authentication flow for AI providers (Google AI, OpenAI, Kimi/Moonshot)
- Streamlined Settings to use API Key authentication only
- Cleaned up unused OAuth-related code and imports

## Bug Fixes
- Fixed race conditions when rapidly switching API keys
- Added proper error handling and rate limit detection for model fetching
- Added loading states during model retrieval

## Migration Notes
- **No action required** for existing users
- Your existing API keys will continue to work
- Models will be fetched automatically the next time you open Settings or change your API key
- If you previously used OAuth, you'll need to switch to API Key authentication

## Breaking Changes
- **OAuth authentication removed**: Users who previously connected via OAuth will need to obtain an API key from their provider and enter it in Settings

## Dependencies
- Added `tesseract` Rust crate (v0.15) for OCR functionality
