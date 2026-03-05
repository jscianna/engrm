#!/bin/bash
# Engrm Onboarding Script
# Scans existing memory files, shows what would be imported, migrates with one command

set -e

ENGRM_API_URL="${ENGRM_API_URL:-https://www.engrm.xyz/api/v1}"
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    🧠 Engrm Onboarding                    ║"
echo "║           Install once. Remember forever.                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check for API key
if [ -z "$ENGRM_API_KEY" ]; then
    echo -e "${YELLOW}Enter your Engrm API key:${NC}"
    read -r ENGRM_API_KEY
    if [ -z "$ENGRM_API_KEY" ]; then
        echo -e "${RED}Error: API key required${NC}"
        exit 1
    fi
fi

# Verify API key
echo -e "\n${CYAN}Verifying API key...${NC}"
VERIFY=$(curl -s -o /dev/null -w "%{http_code}" "${ENGRM_API_URL}/memories?limit=1" \
    -H "Authorization: Bearer ${ENGRM_API_KEY}")

if [ "$VERIFY" != "200" ]; then
    echo -e "${RED}Error: Invalid API key or connection failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ API key verified${NC}"

# Scan for memory files
echo -e "\n${CYAN}Scanning for existing memory files...${NC}"

MEMORY_FILES=()
TOTAL_LINES=0
TOTAL_SIZE=0

# Common memory file locations
SCAN_PATHS=(
    "./MEMORY.md"
    "./memory/*.md"
    "~/.claude/MEMORY.md"
    "~/clawd/MEMORY.md"
    "~/clawd/memory/*.md"
    "./AGENTS.md"
)

for pattern in "${SCAN_PATHS[@]}"; do
    expanded=$(eval echo "$pattern")
    for file in $expanded; do
        if [ -f "$file" ]; then
            lines=$(wc -l < "$file" | tr -d ' ')
            size=$(wc -c < "$file" | tr -d ' ')
            MEMORY_FILES+=("$file")
            TOTAL_LINES=$((TOTAL_LINES + lines))
            TOTAL_SIZE=$((TOTAL_SIZE + size))
            echo -e "  ${GREEN}Found:${NC} $file ($lines lines)"
        fi
    done
done

if [ ${#MEMORY_FILES[@]} -eq 0 ]; then
    echo -e "${YELLOW}No memory files found. Starting fresh!${NC}"
else
    echo -e "\n${CYAN}Summary:${NC}"
    echo -e "  Files found: ${#MEMORY_FILES[@]}"
    echo -e "  Total lines: $TOTAL_LINES"
    echo -e "  Total size:  $((TOTAL_SIZE / 1024))KB"
    
    # Estimate token savings
    AVG_TOKENS_PER_CHAR=0.25
    TOTAL_TOKENS=$((TOTAL_SIZE * 25 / 100))
    SESSIONS_PER_DAY=20
    DAILY_TOKENS=$((TOTAL_TOKENS * SESSIONS_PER_DAY))
    DAILY_SAVINGS=$((DAILY_TOKENS * 90 / 100))  # 90% savings estimate
    
    echo -e "\n${CYAN}Estimated savings with Engrm:${NC}"
    echo -e "  Current context load: ~$TOTAL_TOKENS tokens/session"
    echo -e "  With Engrm (tiered):  ~$((TOTAL_TOKENS / 10)) tokens/session"
    echo -e "  ${GREEN}Daily savings: ~$DAILY_SAVINGS tokens${NC}"
fi

# Ask to proceed
echo -e "\n${YELLOW}What would you like to do?${NC}"
echo "  1) Import existing memories to Engrm"
echo "  2) Start fresh (no import)"
echo "  3) Exit"
read -r -p "Choice [1-3]: " choice

case $choice in
    1)
        echo -e "\n${CYAN}Importing memories...${NC}"
        
        IMPORTED=0
        FAILED=0
        
        for file in "${MEMORY_FILES[@]}"; do
            echo -e "Processing: $file"
            
            # Extract sections and import
            # This is a simplified version - production would parse markdown properly
            content=$(cat "$file")
            title=$(basename "$file" .md)
            
            response=$(curl -s -X POST "${ENGRM_API_URL}/simple/remember" \
                -H "Authorization: Bearer ${ENGRM_API_KEY}" \
                -H "Content-Type: application/json" \
                -d "{\"text\": \"Imported from $file: $(echo "$content" | head -c 2000 | jq -Rs .)\"}" 2>/dev/null || echo '{"error":true}')
            
            if echo "$response" | grep -q '"stored":true'; then
                IMPORTED=$((IMPORTED + 1))
                echo -e "  ${GREEN}✓${NC} Imported"
            else
                FAILED=$((FAILED + 1))
                echo -e "  ${RED}✗${NC} Failed"
            fi
        done
        
        echo -e "\n${GREEN}Import complete!${NC}"
        echo -e "  Imported: $IMPORTED"
        echo -e "  Failed: $FAILED"
        ;;
    2)
        echo -e "\n${GREEN}Starting fresh. Your agent now has Engrm memory!${NC}"
        ;;
    *)
        echo -e "\n${YELLOW}Exiting.${NC}"
        exit 0
        ;;
esac

# Setup instructions
echo -e "\n${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    🎉 Setup Complete!                      ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"

echo -e "\n${GREEN}Next steps:${NC}"
echo ""
echo "1. Add to your agent's config:"
echo -e "   ${CYAN}export ENGRM_API_KEY=\"${ENGRM_API_KEY}\"${NC}"
echo ""
echo "2. For OpenClaw, add the Engrm skill:"
echo -e "   ${CYAN}cp -r engrm-skill ~/.openclaw/skills/engrm${NC}"
echo ""
echo "3. Your agent will now automatically:"
echo "   • Recall relevant context at conversation start"
echo "   • Store important insights during conversations"
echo "   • Get smarter over time"
echo ""
echo -e "${GREEN}Memory is automatic. Just start chatting.${NC}"
