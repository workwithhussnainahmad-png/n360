"use client";

import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import styles from "./faq.module.css";

export interface FaqItemData {
  id: string;
  category: "general" | "admissions" | "fees" | "academics" | "operations";
  categoryLabel: string;
  question: string;
  answer: string | React.ReactNode;
}

const CATEGORIES = [
  { id: "all", label: "All Questions (25)" },
  { id: "general", label: "General & Roles" },
  { id: "admissions", label: "Admissions" },
  { id: "fees", label: "Fees & Payments" },
  { id: "academics", label: "Academics & Exams" },
  { id: "operations", label: "Attendance & Security" },
];

export function FaqAccordion({ items }: { items: FaqItemData[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const searchInputId = useId();

  const toggle = (id: string) => {
    setActiveId((prev) => (prev === id ? null : id));
  };

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory =
        selectedCategory === "all" || item.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!q) return true;
      const questionText = item.question.toLowerCase();
      const answerText = typeof item.answer === "string" ? item.answer.toLowerCase() : "";
      return questionText.includes(q) || answerText.includes(q);
    });
  }, [items, selectedCategory, query]);

  return (
    <div className={styles.faqSection}>
      {/* Search & Category Filter Controls */}
      <div className={styles.filterControls}>
        <div className={styles.categoryChips} role="tablist" aria-label="FAQ Categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                setActiveId(null);
              }}
              className={`${styles.categoryButton} ${
                selectedCategory === cat.id ? styles.active : ""
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} aria-hidden="true" />
          <input
            id={searchInputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions or keywords..."
            className={styles.searchInput}
            aria-label="Search questions"
          />
        </div>
      </div>

      {/* Accordion List */}
      {filteredItems.length === 0 ? (
        <div className={styles.noResults}>
          <p>No questions matched your search query &ldquo;{query}&rdquo;.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSelectedCategory("all");
            }}
            className={styles.textLink}
            style={{ marginTop: "1rem" }}
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className={styles.faqList} role="region" aria-label="Frequently Asked Questions">
          {filteredItems.map((item, index) => {
            const isOpen = activeId === item.id;
            const itemNumber = (index + 1).toString().padStart(2, "0");

            return (
              <div
                key={item.id}
                className={`${styles.faqItem} ${isOpen ? styles.open : ""}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  className={styles.faqQuestionButton}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${item.id}`}
                  id={`faq-question-${item.id}`}
                >
                  <div className={styles.faqTitleGroup}>
                    <span className={styles.faqIndex}>{itemNumber}</span>
                    <span className={styles.faqQuestionText}>{item.question}</span>
                  </div>

                  <span className={styles.toggleCircle} aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>

                {isOpen && (
                  <div
                    id={`faq-answer-${item.id}`}
                    role="region"
                    aria-labelledby={`faq-question-${item.id}`}
                    className={styles.faqAnswerPanel}
                  >
                    <div className={styles.faqAnswerText}>{item.answer}</div>
                    <span className={styles.faqCategoryBadge}>
                      {item.categoryLabel}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
