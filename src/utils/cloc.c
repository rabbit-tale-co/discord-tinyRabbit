// Portable C code without standard library dependencies

// Dynamic language definitions from JSON
typedef struct {
    char name[64];
    char extensions[20][16];  // Max 20 extensions, 16 chars each
    int ext_count;
    char line_comment[8];
    char block_start[8];
    char block_end[8];
} dynamic_lang_t;

// Global language database (loaded from JSON)
static dynamic_lang_t g_languages[300]; // Static allocation for 300 languages
static int g_lang_count = 0;

// String utilities
static int str_len(const char* s) {
    if (!s) return 0;
    int len = 0;
    while (s[len]) len++;
    return len;
}

static void str_copy(char* dst, const char* src, int max_len) {
    int i = 0;
    while (src && src[i] && i < max_len - 1) {
        dst[i] = src[i];
        i++;
    }
    dst[i] = '\0';
}

static int str_equals_ci(const char* a, const char* b) {
    if (!a || !b) return 0;
    while (*a && *b) {
        char ca = *a >= 'A' && *a <= 'Z' ? *a + 32 : *a;
        char cb = *b >= 'A' && *b <= 'Z' ? *b + 32 : *b;
        if (ca != cb) return 0;
        a++;
        b++;
    }
    return *a == *b;
}

// Add a single language definition
void add_language(
    const char* name,
    const char* extensions,      // Comma-separated extensions
    const char* line_comment,
    const char* block_start,
    const char* block_end
) {
    if (g_lang_count >= 300) return; // Max languages reached

    dynamic_lang_t* lang = &g_languages[g_lang_count++];

    // Copy name
    str_copy(lang->name, name, 64);

    // Parse extensions (comma-separated)
    lang->ext_count = 0;
    if (extensions) {
        const char* ext_str = extensions;
        int start = 0;
        int pos = 0;

        while (ext_str[pos] && lang->ext_count < 20) {
            if (ext_str[pos] == ',' || ext_str[pos] == '\0') {
                // Extract extension
                int len = pos - start;
                if (len > 0 && len < 15) {
                    int j = 0;
                    // Add dot if not present
                    if (ext_str[start] != '.') {
                        lang->extensions[lang->ext_count][j++] = '.';
                    }
                    // Copy extension
                    for (int k = start; k < pos && j < 15; k++, j++) {
                        lang->extensions[lang->ext_count][j] = ext_str[k];
                    }
                    lang->extensions[lang->ext_count][j] = '\0';
                    lang->ext_count++;
                }
                start = pos + 1;
            }
            if (ext_str[pos]) pos++;
            else break;
        }
    }

    // Copy comment patterns
    str_copy(lang->line_comment, line_comment, 8);
    str_copy(lang->block_start, block_start, 8);
    str_copy(lang->block_end, block_end, 8);
}

// Fast language detection using dynamic database
static const dynamic_lang_t* detect_language(const char* filepath) {
    if (g_lang_count == 0) return 0; // No languages loaded

    // Find the last dot for extension
    const char* ext = 0;
    for (const char* p = filepath    ; *p; p++) {
        if (*p == '.') ext = p;
    }
    if (!ext) return 0;

    // Check each language
    for (int i = 0; i < g_lang_count; i++) {
        const dynamic_lang_t* lang = &g_languages[i];
        for (int j = 0; j < lang->ext_count; j++) {
            if (str_equals_ci(ext, lang->extensions[j])) {
                return lang;
            }
        }
    }
    return 0;
}

// Optimized byte matching
static int bytes_match(const unsigned char* buf, int pos, const char* pattern, int pattern_len, int buf_len) {
    if (!pattern || pattern_len == 0) return 0;
    if (pos + pattern_len > buf_len) return 0;

    for (int i = 0; i < pattern_len; i++) {
        if (buf[pos + i] != (unsigned char)pattern[i]) return 0;
    }
    return 1;
}

// Process a single file buffer
static void count_file_buffer(const unsigned char* buffer, int buf_size, const dynamic_lang_t* lang, int* result) {
    result[0] = result[1] = result[2] = result[3] = result[4] = 0;
    result[4] = buf_size; // size

    if (buf_size == 0) {
        result[0] = 1; // lines
        result[3] = 1; // blanks
        return;
    }

    const char* line_comment = (lang && lang->line_comment[0]) ? lang->line_comment : 0;
    const char* block_start = (lang && lang->block_start[0]) ? lang->block_start : 0;
    const char* block_end = (lang && lang->block_end[0]) ? lang->block_end : 0;

    int lc_len = str_len(line_comment);
    int bs_len = str_len(block_start);
    int be_len = str_len(block_end);

    int lines = 1;
    int code = 0;
    int comments = 0;
    int blanks = 0;
    int i = 0;
    int in_block = 0;
    int line_start = 1;
    int is_empty = 1;

    while (i < buf_size) {
        unsigned char c = buffer[i];

        if (c == '\n') {
            if (in_block) comments++;
            else if (is_empty) blanks++;
            else code++;

            lines++;
            line_start = 1;
            is_empty = 1;
            i++;
            continue;
        }

        if (line_start && (c == ' ' || c == '\t')) {
            i++;
            continue;
        }

        if (line_start) {
            line_start = 0;

            // Check for block comment end
            if (in_block && bytes_match(buffer, i, block_end, be_len, buf_size)) {
                in_block = 0;
                i += be_len;
                is_empty = 0;
                continue;
            }

            if (!in_block) {
                // Check for line comment
                if (bytes_match(buffer, i, line_comment, lc_len, buf_size)) {
                    comments++;
                    while (i < buf_size && buffer[i] != '\n') i++;
                    continue;
                }

                // Check for block comment start
                if (bytes_match(buffer, i, block_start, bs_len, buf_size)) {
                    in_block = 1;
                    i += bs_len;

                    // Check if block comment ends on same line
                    if (be_len > 0) {
                        for (int j = i; j <= buf_size - be_len; j++) {
                            if (buffer[j] == '\n') break;
                            if (bytes_match(buffer, j, block_end, be_len, buf_size)) {
                                in_block = 0;
                                i = j + be_len;
                                break;
                            }
                        }
                    }
                    is_empty = 0;
                    continue;
                }
            }
        }

        if (c != ' ' && c != '\t') is_empty = 0;
        i++;
    }

    // Handle final line
    if (in_block) comments++;
    else if (is_empty) blanks++;
    else code++;

    result[0] = lines;
    result[1] = code;
    result[2] = comments;
    result[3] = blanks;
}

// Analyze a single file
void analyze_file(
    const char* file_path,
    const unsigned char* file_buffer,
    int file_size,
    int* result  // Output: [lines, code, comments, blanks, size]
) {
    // Detect language
    const dynamic_lang_t* lang = detect_language(file_path);

    // Count lines in this file
    count_file_buffer(file_buffer, file_size, lang, result);
}

// Get language name for a file
void get_language_name(const char* file_path, char* lang_name, int max_len) {
    const dynamic_lang_t* lang = detect_language(file_path);
    if (lang) {
        str_copy(lang_name, lang->name, max_len);
    } else {
        str_copy(lang_name, "Unknown", max_len);
    }
}

// Cleanup function
void cleanup_languages() {
    // Legacy function - not used in new implementation
}

// Legacy functions for compatibility
void count_batch(
    const unsigned char* file_data,
    const int* file_sizes,
    const int* file_lang_offsets,
    const unsigned char* lang_data,
    const int* lang_sizes,
    int num_files,
    int* results
) {
    // Legacy function - not used in new implementation
}

void count_buffer(const unsigned char* buffer, int buf_size,
                  const unsigned char* line_comment, int lc_len,
                  const unsigned char* block_start, int bs_len,
                  const unsigned char* block_end, int be_len,
                  int* result) {
    // Legacy function - not used in new implementation
}

// BATCH PROCESSING OPTIMIZATION - Process multiple files in one C call
typedef struct {
    int files;
    int lines;
    int code;
    int comments;
    int size;
} lang_stats_t;

// Optimized batch analyzer - processes all files in one call
void analyze_batch(
    const char** file_paths,
    const unsigned char** file_buffers,
    const int* file_sizes,
    int num_files,
    char* lang_names_out,     // Output: concatenated language names (64 chars each)
    int* results_out          // Output: [lines, code, comments, blanks, size] per file
) {
    for (int i = 0; i < num_files; i++) {
        const char* file_path = file_paths[i];
        const unsigned char* buffer = file_buffers[i];
        int file_size = file_sizes[i];

        // Get language
        const dynamic_lang_t* lang = detect_language(file_path);

        // Store language name (64 chars per file)
        char* lang_name_pos = lang_names_out + (i * 64);
        if (lang) {
            str_copy(lang_name_pos, lang->name, 64);
        } else {
            str_copy(lang_name_pos, "Unknown", 64);
        }

        // Analyze file and store results (5 ints per file)
        int* result_pos = results_out + (i * 5);
        count_file_buffer(buffer, file_size, lang, result_pos);
    }
}

// Aggregate results by language in C for maximum speed
void aggregate_results(
    const char* lang_names,        // Input: language names (64 chars each)
    const int* file_results,       // Input: results per file (5 ints each)
    int num_files,
    char* unique_langs_out,        // Output: unique language names (64 chars each)
    int* lang_stats_out,           // Output: aggregated stats (5 ints each)
    int* num_langs_out             // Output: number of unique languages
) {
    lang_stats_t temp_stats[100];  // Support up to 100 languages
    char temp_names[100][64];
    int lang_count = 0;

    for (int i = 0; i < num_files; i++) {
        const char* file_lang = lang_names + (i * 64);
        const int* file_result = file_results + (i * 5);

        // Skip unknown files
        if (str_equals_ci(file_lang, "Unknown")) continue;

        // Find existing language or create new one
        int lang_idx = -1;
        for (int j = 0; j < lang_count; j++) {
            if (str_equals_ci(temp_names[j], file_lang)) {
                lang_idx = j;
                break;
            }
        }

        if (lang_idx == -1) {
            // New language
            if (lang_count < 100) {
                lang_idx = lang_count++;
                str_copy(temp_names[lang_idx], file_lang, 64);
                temp_stats[lang_idx].files = 0;
                temp_stats[lang_idx].lines = 0;
                temp_stats[lang_idx].code = 0;
                temp_stats[lang_idx].comments = 0;
                temp_stats[lang_idx].size = 0;
            } else {
                continue; // Skip if too many languages
            }
        }

        // Aggregate stats
        temp_stats[lang_idx].files++;
        temp_stats[lang_idx].lines += file_result[0];
        temp_stats[lang_idx].code += file_result[1];
        temp_stats[lang_idx].comments += file_result[2];
        temp_stats[lang_idx].size += file_result[4];
    }

    // Copy results to output buffers
    *num_langs_out = lang_count;
    for (int i = 0; i < lang_count; i++) {
        str_copy(unique_langs_out + (i * 64), temp_names[i], 64);

        int* stats_out = lang_stats_out + (i * 5);
        stats_out[0] = temp_stats[i].files;
        stats_out[1] = temp_stats[i].lines;
        stats_out[2] = temp_stats[i].code;
        stats_out[3] = temp_stats[i].comments;
        stats_out[4] = temp_stats[i].size;
    }
}
