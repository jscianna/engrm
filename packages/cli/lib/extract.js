/**
 * Extract memories from markdown content.
 * Splits by headings and creates individual memories.
 */
export function extractMemories(content, sourceFile) {
  const memories = [];
  
  // Split by ## headings
  const sections = content.split(/^## /m).filter(Boolean);
  
  for (const section of sections) {
    const lines = section.trim().split('\n');
    const title = lines[0].replace(/^#+\s*/, '').trim();
    const body = lines.slice(1).join('\n').trim();
    
    if (!title || !body || body.length < 20) continue;
    
    // Skip certain sections that shouldn't be memories
    if (title.toLowerCase().includes('table of contents')) continue;
    if (title.toLowerCase() === 'memory.md') continue;
    
    // Check for subsections (### headings)
    const subsections = body.split(/^### /m).filter(Boolean);
    
    if (subsections.length > 1) {
      // Has subsections - create memory for each
      for (const sub of subsections) {
        const subLines = sub.trim().split('\n');
        const subTitle = subLines[0].replace(/^#+\s*/, '').trim();
        const subBody = subLines.slice(1).join('\n').trim();
        
        if (subTitle && subBody && subBody.length >= 20) {
          memories.push({
            title: `${title} - ${subTitle}`,
            content: subBody,
            source: sourceFile
          });
        }
      }
    } else {
      // No subsections - create single memory
      memories.push({
        title,
        content: body,
        source: sourceFile
      });
    }
  }
  
  // Also extract any top-level content before first ## heading
  const topContent = content.split(/^## /m)[0].trim();
  const topLines = topContent.split('\n');
  const topTitle = topLines.find(l => l.startsWith('# '))?.replace(/^#\s*/, '').trim();
  
  if (topTitle && topLines.length > 2) {
    const introContent = topLines.slice(1).join('\n').trim();
    if (introContent.length >= 50) {
      memories.push({
        title: `${topTitle} - Overview`,
        content: introContent.slice(0, 500), // Limit intro length
        source: sourceFile
      });
    }
  }
  
  return memories;
}
