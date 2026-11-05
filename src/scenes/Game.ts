import * as Phaser from 'phaser';

// Placeholder scene: replace with the prototype's gameplay.
export class Game extends Phaser.Scene {
    constructor() {
        super('Game');
    }

    create() {
        const { width, height } = this.scale;
        this.add.text(width / 2, height / 2, 'Spot A Fish', { fontSize: '64px', color: '#ffffff' }).setOrigin(0.5);
        this.add.text(width - 24, height - 30, __APP_VERSION__, { fontSize: '22px', color: '#8a8aa0' }).setOrigin(1, 0.5);
    }
}
