// File: services/streamParser.ts

/**
 * Parses a streaming string from the AI to extract complete slides 
 * and the current HTML chunk in progress.
 * 
 * UPGRADED: Now detects completed slides INSIDE an open batch.
 */
export const parseLiveStream = (
  stream: string
): {
  completeSlides: { title: string; content: string }[];
  inProgressHtml: string;
} => {
  const completeSlides: { title: string; content: string }[] = [];
  
  // 1. Basic Clean up
  let cleanStream = stream.trim();
  if (cleanStream.startsWith("```json")) {
    cleanStream = cleanStream.replace(/^```json/, "").replace(/```$/, "");
  } else if (cleanStream.startsWith("```")) {
    cleanStream = cleanStream.replace(/^```/, "").replace(/```$/, "");
  }

  // --- PHASE 1: Extract Fully Completed Batches ---
  // We scan for top-level JSON objects { ... } that are fully closed.
  
  let braceCount = 0;
  let inString = false;
  let currentObjectStartIndex = -1;
  let lastValidBatchEndIndex = 0;

  for (let i = 0; i < cleanStream.length; i++) {
    const char = cleanStream[i];
    if (char === "\\") { i++; continue; }
    if (char === '"') { inString = !inString; }

    if (!inString) {
      if (char === "{") {
        if (braceCount === 0) currentObjectStartIndex = i;
        braceCount++;
      } else if (char === "}") {
        braceCount--;
        if (braceCount === 0 && currentObjectStartIndex !== -1) {
          // Found a full batch! Parse it.
          const batchStr = cleanStream.substring(currentObjectStartIndex, i + 1);
          try {
            const batch = JSON.parse(batchStr);
            if (batch && Array.isArray(batch.slides)) {
              completeSlides.push(...batch.slides);
            }
            lastValidBatchEndIndex = i + 1;
          } catch (e) { /* ignore invalid JSON */ }
          currentObjectStartIndex = -1;
        }
      }
    }
  }

  // --- PHASE 2: Peek Inside the "Open" Batch ---
  // The "tail" of the stream is likely an incomplete JSON object for the current batch.
  // We want to find slides inside it that are finished.
  
  const remainingStream = cleanStream.substring(lastValidBatchEndIndex);
  let inProgressHtml = "";
  
  // Find where the "slides" array starts in this open batch
  const slidesArrayMatch = remainingStream.match(/"slides"\s*:\s*\[/);
  
  if (slidesArrayMatch && slidesArrayMatch.index !== undefined) {
    const slidesArrayStart = slidesArrayMatch.index + slidesArrayMatch[0].length;
    const slidesString = remainingStream.substring(slidesArrayStart);

    // Scan ONLY the slides array part for objects { ... }
    let slideBraceCount = 0;
    let slideStartIndex = -1;
    let slideInString = false;
    
    // We track the end of the last successfully parsed slide in this partial stream
    let lastParsedSlideEnd = 0; 

    for (let j = 0; j < slidesString.length; j++) {
      const char = slidesString[j];
      if (char === "\\") { j++; continue; }
      if (char === '"') { slideInString = !slideInString; }

      if (!slideInString) {
        if (char === "{") {
          if (slideBraceCount === 0) slideStartIndex = j;
          slideBraceCount++;
        } else if (char === "}") {
          slideBraceCount--;
          if (slideBraceCount === 0 && slideStartIndex !== -1) {
            // We found a closed object inside the slides array!
            // It might be a fully finished slide.
            const potentialSlideStr = slidesString.substring(slideStartIndex, j + 1);
            try {
              const slide = JSON.parse(potentialSlideStr);
              if (slide.title && slide.content) {
                // Check if we already have this slide (deduplication)
                // This is needed because sometimes Batches overlap or retry
                const exists = completeSlides.some(s => s.title === slide.title);
                if (!exists) {
                  completeSlides.push(slide);
                }
                lastParsedSlideEnd = j + 1;
              }
            } catch (e) {
              // If it fails to parse, it might be the current one being written (bad syntax yet)
            }
            slideStartIndex = -1;
          }
        }
      }
    }

    // --- PHASE 3: Extract "In Progress" HTML ---
    // Whatever is AFTER the last fully parsed slide is the content currently being written.
    
    const activeSlidePart = slidesString.substring(lastParsedSlideEnd);
    const contentMatch = activeSlidePart.match(/"content"\s*:\s*"/);
    
    if (contentMatch && contentMatch.index !== undefined) {
      let partialHtml = activeSlidePart.substring(contentMatch.index + contentMatch[0].length);
      
      // Clean up JSON string escaping
      partialHtml = partialHtml
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .replace(/\\\\/g, "\\");

      // Handle the fact that the string isn't closed yet
      // If we see a closing quote that looks like the end of the JSON string, stop there.
      // But purely for preview, we usually just want everything we have so far.
      
      // Auto-close divs for preview stability
      const firstTagEnd = partialHtml.indexOf(">");
      if (firstTagEnd > -1) {
         if(partialHtml.lastIndexOf("</div>") === -1) {
            inProgressHtml = partialHtml + "</div>";
         } else {
            inProgressHtml = partialHtml;
         }
      }
    }
  }

  return { completeSlides, inProgressHtml };
};

export const transformPollinationsURLs = (input: string, apiKey: string) => {
    const urlRegex = /https?:\/\/gen\.pollinations\.ai\/image\/([^\\"\s>]+)/gi;
  
    return input.replaceAll(urlRegex, (full, raw) => {
      let desc = raw.replace(/_/g, " ");
      desc = decodeURIComponent(desc);
      const encoded = encodeURIComponent(desc);
  
      return `https://gen.pollinations.ai/image/${encoded}?model=flux&key=${apiKey}`;
    });
  }
  
  export const convertQuickChartTags = (htmlString: string) => {
    const quickchartTagRegex = /<quickchart([\s\S]+?)>/g;
  
    return htmlString.replace(quickchartTagRegex, (match, attributesString) => {
      const cleanedAttributesString = attributesString
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");
  
      const attributeRegex = /([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
      const attributes: Record<string, string> = {};
      let attrMatch;
  
      while ((attrMatch = attributeRegex.exec(cleanedAttributesString)) !== null) {
        attributes[attrMatch[1]] = attrMatch[3];
      }
  
      if (!attributes.config) return match;
  
      const encodedConfig = encodeURIComponent(
        attributes.config.replaceAll("'", '"')
      );
      const chartUrl = `https://quickchart.io/chart?c=${encodedConfig}`;
      let imgTag = `<img src="${chartUrl}"`;
  
      for (const key in attributes) {
        if (key !== "config") {
          const escapedValue = attributes[key].replace(/"/g, "&quot;");
          imgTag += ` ${key}="${escapedValue}"`;
        }
      }
  
      imgTag += ">";
      return imgTag;
    });
  }