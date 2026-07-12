import { useState, useEffect } from "react";

/**
 * Custom hook for cycling through words with a typewriter effect
 * @param {string[]} words - Array of words to cycle through
 * @param {number} typingSpeed - Speed of typing in ms (default: 100)
 * @param {number} deletingSpeed - Speed of deleting in ms (default: 50)
 * @param {number} pauseDuration - Pause between words in ms (default: 2000)
 * @returns {object} { word: string, isDeleting: boolean }
 */
export function useTypewriter(words, typingSpeed = 100, deletingSpeed = 50, pauseDuration = 2000) {
  const [wordIndex, setWordIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const currentWord = words[wordIndex];
    
    if (isPaused) {
      const pauseTimeout = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, pauseDuration);
      return () => clearTimeout(pauseTimeout);
    }

    const timeout = setTimeout(() => {
      if (!isDeleting) {
        // Typing
        if (displayText.length < currentWord.length) {
          setDisplayText(currentWord.slice(0, displayText.length + 1));
        } else {
          // Finished typing word, pause before deleting
          setIsPaused(true);
        }
      } else {
        // Deleting
        if (displayText.length > 0) {
          setDisplayText(displayText.slice(0, -1));
        } else {
          // Finished deleting, move to next word
          setIsDeleting(false);
          setWordIndex((prev) => (prev + 1) % words.length);
        }
      }
    }, isDeleting ? deletingSpeed : typingSpeed);

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, isPaused, wordIndex, words, typingSpeed, deletingSpeed, pauseDuration]);

  return { word: displayText, isDeleting };
}
