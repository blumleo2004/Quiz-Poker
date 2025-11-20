export class FXManager {
    constructor(audioManager) {
        this.audio = audioManager;
    }

    confetti() {
        if (window.confetti) {
            window.confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#00ff88', '#00ccff', '#ff00cc']
            });
        }
    }

    shake(element) {
        if (!element) return;
        element.classList.add('shake-anim');
        setTimeout(() => element.classList.remove('shake-anim'), 500);
    }

    highlightTurn(socketId) {
        document.querySelectorAll('.player-seat').forEach(seat => {
            const isActive = seat.dataset.id === socketId;
            seat.classList.toggle('active-turn', isActive);

            // Update transform to maintain position but scale if active
            const currentLeft = seat.style.left;
            const currentTop = seat.style.top;
            if (currentLeft && currentTop) {
                seat.style.transform = `translate(-50%, -50%) ${isActive ? 'scale(1.15)' : 'scale(1)'}`;
            }

            // Add/remove active indicator
            let indicator = seat.querySelector('.active-indicator');
            if (isActive && !indicator) {
                indicator = document.createElement('div');
                indicator.className = 'active-indicator';
                indicator.textContent = '▶';
                seat.insertBefore(indicator, seat.firstChild);
            } else if (!isActive && indicator) {
                indicator.remove();
            }
        });
    }

    animateChips(fromElement, toElement) {
        if (!fromElement || !toElement) return;

        const startRect = fromElement.getBoundingClientRect();
        const endRect = toElement.getBoundingClientRect();

        const chip = document.createElement('div');
        chip.className = 'flying-chip';
        chip.textContent = '🪙';
        chip.style.left = `${startRect.left + startRect.width / 2}px`;
        chip.style.top = `${startRect.top + startRect.height / 2}px`;

        document.body.appendChild(chip);

        // Force reflow
        chip.getBoundingClientRect();

        chip.style.transform = `translate(${endRect.left - startRect.left}px, ${endRect.top - startRect.top}px)`;

        setTimeout(() => {
            chip.remove();
            if (this.audio) this.audio.playChip(); // Play sound when chip hits pot
        }, 600);
    }
}
